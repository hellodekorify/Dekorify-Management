import { prisma } from "../db";
import {
  applyFxRate,
  FX_IDENTITY,
  multiplyByQuantity,
  parseMoney,
  toDecimalString,
} from "../money";
import { parseDateInput } from "../dates";
import { isCurrencyCode } from "../currency";
import { buildDedupeKey, matchEnum, type ValidatedRow } from "./validate";
import type { ImportTarget } from "../constants";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const CHUNK = 200;

export interface ExecuteImportOptions {
  storeId: string;
  batchId: string | null;
  target: ImportTarget;
  rows: ValidatedRow[];
  baseCurrency: string;
}

/**
 * Writes validated rows into the database inside a single transaction, so a
 * failure part-way through leaves the books exactly as they were.
 *
 * Kept apart from the server action so it can be exercised directly.
 */
export async function executeImport(options: ExecuteImportOptions): Promise<number> {
  const { storeId, batchId, target, rows, baseCurrency } = options;

  return prisma.$transaction(
    async (tx) => {
      const lookups = await buildLookups(tx, storeId, target, rows);

      switch (target) {
        case "SALE":
          return importSales(tx, storeId, batchId, rows, baseCurrency);
        case "EXPENSE":
          return importExpenses(tx, storeId, batchId, rows, baseCurrency, lookups.categories);
        case "COGS":
          return importCogs(tx, storeId, batchId, rows, baseCurrency, lookups.suppliers);
        case "AD_SPEND":
          return importAdSpend(tx, storeId, batchId, rows, baseCurrency);
        case "PRODUCT":
          return importProducts(tx, storeId, rows, lookups.suppliers);
        case "SUPPLIER":
          return importSuppliers(tx, storeId, rows);
        default:
          return 0;
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

async function chunkedCreate<T>(
  rows: T[],
  create: (chunk: T[]) => Promise<unknown>,
): Promise<number> {
  for (let index = 0; index < rows.length; index += CHUNK) {
    await create(rows.slice(index, index + CHUNK));
  }
  return rows.length;
}

function money(value: string | null | undefined): bigint {
  return parseMoney(value ?? "") ?? 0n;
}

function whole(value: string | null | undefined, fallback = 1): number {
  if (!value) return fallback;
  const parsed = Number(value.replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function currencyOf(value: string | null | undefined, base: string): string {
  const code = (value ?? "").trim().toUpperCase();
  return isCurrencyCode(code) ? code : base;
}

async function importSales(
  tx: Tx,
  storeId: string,
  batchId: string | null,
  rows: ValidatedRow[],
  baseCurrency: string,
): Promise<number> {
  const data = rows.map(({ raw }) => {
    const gross = money(raw.grossAmount);
    const discount = money(raw.discount);
    const refund = money(raw.refund);
    const shipping = money(raw.shippingRevenue);

    const fulfillmentStatus = raw.fulfillmentStatus
      ? matchEnum(raw.fulfillmentStatus, [
          "FULFILLED",
          "IN_TRANSIT",
          "UNFULFILLED",
          "RETURNED",
          "CANCELLED",
        ])
      : null;

    const isCancelled = fulfillmentStatus === "CANCELLED";
    const earnsRevenue = !isCancelled && fulfillmentStatus !== "RETURNED";
    const net = earnsRevenue ? gross - discount - refund + shipping : 0n;

    return {
      storeId,
      importBatchId: batchId,
      date: parseDateInput(raw.date)!,
      orderId: raw.orderId!,
      customerName: raw.customerName || null,
      channel: raw.channel || "Shopify",
      productName: raw.productName || null,
      sku: raw.sku || null,
      quantity: whole(raw.quantity, 1),
      grossAmountMinor: gross,
      discountMinor: discount,
      refundMinor: refund,
      shippingRevenueMinor: shipping,
      paymentFeeMinor: earnsRevenue ? money(raw.paymentFee) : 0n,
      netRevenueMinor: net,
      currency: currencyOf(raw.currency, baseCurrency),
      fxRateE8: FX_IDENTITY,
      baseNetRevenueMinor: net,
      financialStatus: raw.financialStatus
        ? matchEnum(raw.financialStatus, ["PAID", "PENDING", "PARTIALLY_REFUNDED", "REFUNDED"])
        : null,
      fulfillmentStatus,
      isCancelled,
      notes: raw.notes || null,
    };
  });

  return chunkedCreate(data, (chunk) => tx.sale.createMany({ data: chunk }));
}

async function importExpenses(
  tx: Tx,
  storeId: string,
  batchId: string | null,
  rows: ValidatedRow[],
  baseCurrency: string,
  categories: Map<string, string>,
): Promise<number> {
  const data = rows.map(({ raw }) => {
    const amount = money(raw.amount);
    return {
      storeId,
      importBatchId: batchId,
      date: parseDateInput(raw.date)!,
      name: raw.name!,
      categoryId: raw.category ? (categories.get(raw.category.trim().toLowerCase()) ?? null) : null,
      amountMinor: amount,
      currency: currencyOf(raw.currency, baseCurrency),
      fxRateE8: FX_IDENTITY,
      baseAmountMinor: applyFxRate(amount, FX_IDENTITY),
      paymentMethod: raw.paymentMethod ? raw.paymentMethod.trim().toUpperCase() : null,
      vendorName: raw.vendorName || null,
      description: raw.description || null,
      notes: raw.notes || null,
    };
  });

  return chunkedCreate(data, (chunk) => tx.expense.createMany({ data: chunk }));
}

async function importCogs(
  tx: Tx,
  storeId: string,
  batchId: string | null,
  rows: ValidatedRow[],
  baseCurrency: string,
  suppliers: Map<string, string>,
): Promise<number> {
  const data = rows.map(({ raw }) => {
    const quantity = whole(raw.quantity, 1);
    const unitCost = money(raw.unitCost);
    const totalCost = multiplyByQuantity(unitCost, quantity);

    return {
      storeId,
      importBatchId: batchId,
      date: parseDateInput(raw.date)!,
      productName: raw.productName!,
      sku: raw.sku || null,
      supplierId: raw.supplier ? (suppliers.get(raw.supplier.trim().toLowerCase()) ?? null) : null,
      quantity,
      unitCostMinor: unitCost,
      totalCostMinor: totalCost,
      currency: currencyOf(raw.currency, baseCurrency),
      fxRateE8: FX_IDENTITY,
      baseTotalCostMinor: totalCost,
      reference: raw.reference || null,
      notes: raw.notes || null,
    };
  });

  return chunkedCreate(data, (chunk) => tx.cogsEntry.createMany({ data: chunk }));
}

async function importAdSpend(
  tx: Tx,
  storeId: string,
  batchId: string | null,
  rows: ValidatedRow[],
  baseCurrency: string,
): Promise<number> {
  const data = rows.map(({ raw }) => {
    const amount = money(raw.amount);
    return {
      storeId,
      importBatchId: batchId,
      date: parseDateInput(raw.date)!,
      platform:
        matchEnum(raw.platform ?? "", ["META", "GOOGLE", "TIKTOK", "AMAZON", "SNAPCHAT", "OTHER"]) ??
        "OTHER",
      campaignName: raw.campaignName || null,
      campaignId: raw.campaignId || null,
      amountMinor: amount,
      currency: currencyOf(raw.currency, baseCurrency),
      fxRateE8: FX_IDENTITY,
      baseAmountMinor: amount,
      impressions: raw.impressions ? whole(raw.impressions, 0) : null,
      clicks: raw.clicks ? whole(raw.clicks, 0) : null,
      conversions: raw.conversions ? whole(raw.conversions, 0) : null,
      notes: raw.notes || null,
    };
  });

  return chunkedCreate(data, (chunk) => tx.adSpend.createMany({ data: chunk }));
}

async function importProducts(
  tx: Tx,
  storeId: string,
  rows: ValidatedRow[],
  suppliers: Map<string, string>,
): Promise<number> {
  const data = rows.map(({ raw }) => ({
    storeId,
    name: raw.name!,
    sku: raw.sku || null,
    category: raw.category || null,
    sellingPriceMinor: money(raw.sellingPrice),
    unitCostMinor: money(raw.unitCost),
    quantityOnHand: whole(raw.quantityOnHand, 0),
    supplierId: raw.supplier ? (suppliers.get(raw.supplier.trim().toLowerCase()) ?? null) : null,
    notes: raw.notes || null,
  }));

  return chunkedCreate(data, (chunk) => tx.product.createMany({ data: chunk }));
}

async function importSuppliers(tx: Tx, storeId: string, rows: ValidatedRow[]): Promise<number> {
  const data = rows.map(({ raw }) => ({
    storeId,
    name: raw.name!,
    contactName: raw.contactName || null,
    email: raw.email || null,
    phone: raw.phone || null,
    address: raw.address || null,
    city: raw.city || null,
    country: raw.country || null,
    notes: raw.notes || null,
  }));

  return chunkedCreate(data, (chunk) => tx.supplier.createMany({ data: chunk }));
}

/**
 * Categories and suppliers named in the file are matched by name, and created
 * when they do not exist yet — otherwise a whole import would land
 * uncategorised and quietly distort the profit & loss statement.
 */
async function buildLookups(
  tx: Tx,
  storeId: string,
  target: ImportTarget,
  rows: ValidatedRow[],
): Promise<{ categories: Map<string, string>; suppliers: Map<string, string> }> {
  const categories = new Map<string, string>();
  const suppliers = new Map<string, string>();

  if (target === "EXPENSE") {
    const existing = await tx.expenseCategory.findMany({
      where: { storeId, deletedAt: null },
      select: { id: true, name: true },
    });
    for (const row of existing) categories.set(row.name.trim().toLowerCase(), row.id);

    let sortOrder = existing.length;
    for (const name of missingNames(rows, "category", categories)) {
      const created = await tx.expenseCategory.create({
        data: { storeId, name, kind: "OPERATING", color: "#94a3b8", sortOrder: sortOrder++ },
      });
      categories.set(name.toLowerCase(), created.id);
    }
  }

  if (target === "COGS" || target === "PRODUCT") {
    const existing = await tx.supplier.findMany({
      where: { storeId, deletedAt: null },
      select: { id: true, name: true },
    });
    for (const row of existing) suppliers.set(row.name.trim().toLowerCase(), row.id);

    for (const name of missingNames(rows, "supplier", suppliers)) {
      const created = await tx.supplier.create({ data: { storeId, name } });
      suppliers.set(name.toLowerCase(), created.id);
    }
  }

  return { categories, suppliers };
}

function missingNames(
  rows: ValidatedRow[],
  field: string,
  known: Map<string, string>,
): Set<string> {
  return new Set(
    rows
      .map((row) => row.raw[field]?.trim())
      .filter((name): name is string => Boolean(name))
      .filter((name) => !known.has(name.toLowerCase())),
  );
}

/**
 * Every dedupe key already in the database, so the preview can tell the owner
 * which rows they have imported before.
 */
export async function loadExistingKeys(
  storeId: string,
  target: ImportTarget,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const add = (raw: Record<string, string | null>) => {
    const key = buildDedupeKey(target, raw);
    if (key) keys.add(key);
  };

  const iso = (date: Date) => date.toISOString();
  // Integer formatting, not Number(v)/100 — dedupe keys are compared as exact
  // strings, so this must never round differently from the parser.
  const dec = (value: bigint) => toDecimalString(value);

  switch (target) {
    case "SALE": {
      const rows = await prisma.sale.findMany({
        where: { storeId, deletedAt: null },
        select: { orderId: true },
      });
      for (const row of rows) add({ orderId: row.orderId });
      break;
    }
    case "EXPENSE": {
      const rows = await prisma.expense.findMany({
        where: { storeId, deletedAt: null },
        select: { date: true, name: true, amountMinor: true },
      });
      for (const row of rows) {
        add({ date: iso(row.date), name: row.name, amount: dec(row.amountMinor) });
      }
      break;
    }
    case "COGS": {
      const rows = await prisma.cogsEntry.findMany({
        where: { storeId, deletedAt: null },
        select: { date: true, sku: true, productName: true, quantity: true, unitCostMinor: true },
      });
      for (const row of rows) {
        add({
          date: iso(row.date),
          sku: row.sku,
          productName: row.productName,
          quantity: String(row.quantity),
          unitCost: dec(row.unitCostMinor),
        });
      }
      break;
    }
    case "AD_SPEND": {
      const rows = await prisma.adSpend.findMany({
        where: { storeId, deletedAt: null },
        select: { date: true, platform: true, campaignName: true, amountMinor: true },
      });
      for (const row of rows) {
        add({
          date: iso(row.date),
          platform: row.platform,
          campaignName: row.campaignName,
          amount: dec(row.amountMinor),
        });
      }
      break;
    }
    case "PRODUCT": {
      const rows = await prisma.product.findMany({
        where: { storeId, deletedAt: null },
        select: { name: true, sku: true },
      });
      for (const row of rows) add({ name: row.name, sku: row.sku });
      break;
    }
    case "SUPPLIER": {
      const rows = await prisma.supplier.findMany({
        where: { storeId, deletedAt: null },
        select: { name: true },
      });
      for (const row of rows) add({ name: row.name });
      break;
    }
  }

  return keys;
}
