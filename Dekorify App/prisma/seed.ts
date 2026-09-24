/**
 * Demo data for a Pakistani home-decor Shopify store.
 *
 * Everything is generated from a fixed seed, so re-running produces the same
 * figures and any number you check twice matches. Amounts are BigInt minor
 * units throughout — the same discipline the application itself uses.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  addDays,
  eachMonthOfInterval,
  endOfMonth,
  isAfter,
  startOfMonth,
  startOfYear,
} from "date-fns";

const prisma = new PrismaClient();

const DEMO_EMAIL = "hellodekorify@gmail.com";
const DEMO_PASSWORD = "Dekorify2026";
const STORE_NAME = "Dekorify";

// The demo period ends today so "This month" always has something in it.
const TODAY = new Date();
const PERIOD_START = startOfYear(TODAY);

// ---------------------------------------------------------------------------
// Deterministic pseudo-random numbers
// ---------------------------------------------------------------------------

let seed = 20260822;
function random(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}
/** PKR to paisa. */
const rs = (rupees: number): bigint => BigInt(Math.round(rupees * 100));

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const SUPPLIERS = [
  {
    name: "Al-Noor Handicrafts",
    contactName: "Imran Sheikh",
    email: "imran@alnoorcrafts.pk",
    phone: "+92 300 4471820",
    city: "Lahore",
    country: "Pakistan",
  },
  {
    name: "Karachi Glass Works",
    contactName: "Farah Siddiqui",
    email: "orders@kgwglass.pk",
    phone: "+92 321 2298104",
    city: "Karachi",
    country: "Pakistan",
  },
  {
    name: "Sialkot Metal Craft",
    contactName: "Bilal Ahmed",
    email: "bilal@sialkotmetal.com",
    phone: "+92 333 8820561",
    city: "Sialkot",
    country: "Pakistan",
  },
  {
    name: "Guangzhou Home Decor Co.",
    contactName: "Li Wei",
    email: "liwei@gzhomedecor.cn",
    phone: "+86 20 8834 2210",
    city: "Guangzhou",
    country: "China",
  },
  {
    name: "Multan Pottery House",
    contactName: "Sana Rafiq",
    email: "sana@multanpottery.pk",
    phone: "+92 302 7719345",
    city: "Multan",
    country: "Pakistan",
  },
] as const;

const PRODUCTS = [
  { name: "LED Trendy Lamp - Black", sku: "DK-TL-BLK", price: 4200, cost: 1850, supplier: 2, category: "Lighting", weight: 14 },
  { name: "LED Trendy Lamp - Gold", sku: "DK-TL-GLD", price: 4500, cost: 1980, supplier: 2, category: "Lighting", weight: 12 },
  { name: "Ceramic Vase Set - 3 Pcs", sku: "DK-CV-3", price: 6500, cost: 2900, supplier: 4, category: "Vases", weight: 9 },
  { name: "Glass Bulb Vase - 2 Pcs", sku: "DK-GB-2", price: 3200, cost: 1350, supplier: 1, category: "Vases", weight: 11 },
  { name: "Macrame Wall Hanging - Large", sku: "DK-MC-L", price: 5400, cost: 2100, supplier: 0, category: "Wall Decor", weight: 8 },
  { name: "Scented Candle Trio", sku: "DK-SC-3", price: 2800, cost: 1050, supplier: 0, category: "Fragrance", weight: 10 },
  { name: "Wooden Photo Frame - Set of 4", sku: "DK-PF-4", price: 3900, cost: 1600, supplier: 0, category: "Wall Decor", weight: 7 },
  { name: "Marble Coaster Set - 6 Pcs", sku: "DK-MCS-6", price: 2400, cost: 890, supplier: 4, category: "Tabletop", weight: 6 },
  { name: "Rattan Pendant Light", sku: "DK-RP-01", price: 8900, cost: 4200, supplier: 3, category: "Lighting", weight: 5 },
  { name: "Velvet Cushion Cover - Pair", sku: "DK-VC-2", price: 3100, cost: 1180, supplier: 0, category: "Soft Furnishing", weight: 9 },
  { name: "Brass Table Clock", sku: "DK-BTC-01", price: 7200, cost: 3300, supplier: 2, category: "Tabletop", weight: 4 },
  { name: "Artificial Monstera Plant", sku: "DK-AM-01", price: 4800, cost: 1900, supplier: 3, category: "Greenery", weight: 7 },
  { name: "Mirror Tray - Rose Gold", sku: "DK-MT-RG", price: 5600, cost: 2350, supplier: 1, category: "Tabletop", weight: 5 },
  { name: "Terracotta Planter Set - 3 Pcs", sku: "DK-TP-3", price: 3600, cost: 1450, supplier: 4, category: "Greenery", weight: 8 },
] as const;

const CUSTOMERS = [
  "Ayesha Khan", "Hamza Malik", "Sara Iqbal", "Bilal Rehman", "Zainab Ali",
  "Usman Tariq", "Mahnoor Shah", "Faisal Qureshi", "Hina Aslam", "Danish Javed",
  "Komal Nawaz", "Adeel Butt", "Rabia Farooq", "Shahzad Anwar", "Nida Hussain",
  "Talha Saeed", "Maryam Zubair", "Omar Chaudhry", "Sadia Kamal", "Junaid Akram",
];

const CHANNELS = ["Shopify", "Shopify", "Shopify", "Shopify", "Instagram", "WhatsApp"] as const;

// ---------------------------------------------------------------------------

async function main() {
  console.log("Seeding demo data...\n");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: { email: DEMO_EMAIL, name: "Dekorify Owner", passwordHash },
  });

  // Start the demo store clean so re-seeding never doubles the figures.
  const existing = await prisma.storeMember.findFirst({
    where: { userId: user.id, store: { name: STORE_NAME } },
  });
  if (existing) {
    await prisma.store.delete({ where: { id: existing.storeId } });
    console.log("  Removed the previous demo store.");
  }

  const store = await prisma.store.create({
    data: {
      name: STORE_NAME,
      baseCurrency: "PKR",
      timezone: "Asia/Karachi",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  console.log(`  Store "${store.name}" created.`);

  const categories = await seedCategories(store.id);
  const suppliers = await seedSuppliers(store.id);
  const products = await seedProducts(store.id, suppliers);

  await prisma.cashAccount.create({
    data: {
      storeId: store.id,
      name: "Meezan Bank - Current",
      type: "BANK",
      currency: "PKR",
      openingBalanceMinor: rs(850_000),
      openingDate: PERIOD_START,
      isDefault: true,
    },
  });
  await prisma.cashAccount.create({
    data: {
      storeId: store.id,
      name: "Cash in hand",
      type: "CASH",
      currency: "PKR",
      openingBalanceMinor: rs(120_000),
      openingDate: PERIOD_START,
    },
  });

  const months = eachMonthOfInterval({ start: PERIOD_START, end: TODAY });

  const unitsByProductMonth = await seedSales(store.id, products, months);
  await seedCogs(store.id, products, suppliers, unitsByProductMonth, months);
  await seedSupplierPayments(suppliers);
  await seedAdSpend(store.id, months);
  await seedExpenses(store.id, categories, months);
  await seedRecurringExpenses(store.id, categories);
  await seedCashEntries(store.id, months);

  console.log("\nDone.");
  console.log("--------------------------------------------------");
  console.log(`  Sign in with:  ${DEMO_EMAIL}`);
  console.log(`  Password:      ${DEMO_PASSWORD}`);
  console.log("--------------------------------------------------");
}

// ---------------------------------------------------------------------------

async function seedCategories(storeId: string) {
  const { DEFAULT_EXPENSE_CATEGORIES } = await import("../src/lib/constants");

  await prisma.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map((category, index) => ({
      storeId,
      name: category.name,
      kind: category.kind,
      color: category.color,
      sortOrder: index,
      isSystem: true,
    })),
  });

  const rows = await prisma.expenseCategory.findMany({ where: { storeId } });
  const byName = new Map(rows.map((row) => [row.name, row.id]));
  console.log(`  ${rows.length} expense categories.`);
  return byName;
}

async function seedSuppliers(storeId: string) {
  const created = [];
  for (const supplier of SUPPLIERS) {
    created.push(
      await prisma.supplier.create({
        data: {
          storeId,
          name: supplier.name,
          contactName: supplier.contactName,
          email: supplier.email,
          phone: supplier.phone,
          city: supplier.city,
          country: supplier.country,
        },
      }),
    );
  }
  console.log(`  ${created.length} suppliers.`);
  return created;
}

async function seedProducts(storeId: string, suppliers: { id: string }[]) {
  const created = [];
  for (const product of PRODUCTS) {
    created.push(
      await prisma.product.create({
        data: {
          storeId,
          name: product.name,
          sku: product.sku,
          category: product.category,
          sellingPriceMinor: rs(product.price),
          unitCostMinor: rs(product.cost),
          quantityOnHand: randomInt(12, 140),
          reorderLevel: 20,
          supplierId: suppliers[product.supplier].id,
        },
      }),
    );
  }
  console.log(`  ${created.length} products.`);
  return created;
}

/** Weighted pick so the catalogue has genuine best-sellers and slow movers. */
function pickProduct(): (typeof PRODUCTS)[number] {
  const totalWeight = PRODUCTS.reduce((sum, product) => sum + product.weight, 0);
  let ticket = random() * totalWeight;
  for (const product of PRODUCTS) {
    ticket -= product.weight;
    if (ticket <= 0) return product;
  }
  return PRODUCTS[0];
}

async function seedSales(
  storeId: string,
  products: { id: string; sku: string | null }[],
  months: Date[],
) {
  const productIdBySku = new Map(products.map((product) => [product.sku, product.id]));
  const unitsByProductMonth = new Map<string, number>();

  const rows: {
    storeId: string;
    date: Date;
    orderId: string;
    customerName: string;
    channel: string;
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    grossAmountMinor: bigint;
    discountMinor: bigint;
    refundMinor: bigint;
    shippingRevenueMinor: bigint;
    paymentFeeMinor: bigint;
    netRevenueMinor: bigint;
    baseNetRevenueMinor: bigint;
    financialStatus: string;
    fulfillmentStatus: string;
    isCancelled: boolean;
  }[] = [];

  let orderNumber = 5100;

  for (const monthStart of months) {
    const monthEnd = endOfMonth(monthStart);
    const lastDay = isAfter(monthEnd, TODAY) ? TODAY : monthEnd;
    const daysInPeriod = Math.max(
      1,
      Math.round((lastDay.getTime() - monthStart.getTime()) / 86_400_000) + 1,
    );

    // Roughly 300 orders in a full month, scaled if the month is partial.
    const seasonality = 0.85 + random() * 0.4;
    const orderCount = Math.round((300 * seasonality * daysInPeriod) / 30);

    for (let index = 0; index < orderCount; index++) {
      const date = addDays(monthStart, randomInt(0, daysInPeriod - 1));
      if (isAfter(date, TODAY)) continue;

      const product = pickProduct();
      const quantity = random() < 0.82 ? 1 : randomInt(2, 3);
      const gross = rs(product.price * quantity);

      // One order in eight carries a discount code.
      const discount = random() < 0.13 ? (gross * BigInt(randomInt(5, 20))) / 100n : 0n;
      const shipping = random() < 0.72 ? rs(250) : 0n;

      // Cash on delivery dominates; prepaid orders carry a gateway fee.
      const prepaid = random() < 0.18;
      const subtotal = gross - discount + shipping;
      const paymentFee = prepaid ? (subtotal * 25n) / 1000n : 0n;

      const roll = random();
      let fulfillmentStatus = "FULFILLED";
      let isCancelled = false;
      let refund = 0n;

      if (roll < 0.055) {
        isCancelled = true;
        fulfillmentStatus = "CANCELLED";
      } else if (roll < 0.185) {
        fulfillmentStatus = "RETURNED";
      } else if (roll < 0.215 && isAfter(addDays(date, 6), TODAY)) {
        fulfillmentStatus = "IN_TRANSIT";
      } else if (random() < 0.022) {
        refund = subtotal;
        fulfillmentStatus = "FULFILLED";
      }

      const netRevenue = isCancelled || fulfillmentStatus === "RETURNED" ? 0n : subtotal - refund;

      const productId = productIdBySku.get(product.sku);
      if (!productId) continue;

      // Only orders that actually count as revenue consume stock.
      if (netRevenue > 0n && fulfillmentStatus === "FULFILLED") {
        const key = `${product.sku}|${monthStart.toISOString().slice(0, 7)}`;
        unitsByProductMonth.set(key, (unitsByProductMonth.get(key) ?? 0) + quantity);
      }

      orderNumber += 1;

      rows.push({
        storeId,
        date,
        orderId: `#DK-${String(monthStart.getMonth() + 1).padStart(2, "0")}${String(
          monthStart.getFullYear(),
        ).slice(2)}-${orderNumber}`,
        customerName: pick(CUSTOMERS),
        channel: pick(CHANNELS),
        productId,
        productName: product.name,
        sku: product.sku,
        quantity,
        grossAmountMinor: gross,
        discountMinor: discount,
        refundMinor: refund,
        shippingRevenueMinor: shipping,
        paymentFeeMinor: isCancelled || fulfillmentStatus === "RETURNED" ? 0n : paymentFee,
        netRevenueMinor: netRevenue,
        baseNetRevenueMinor: netRevenue,
        financialStatus: prepaid ? "PAID" : refund > 0n ? "REFUNDED" : "PENDING",
        fulfillmentStatus,
        isCancelled,
      });
    }
  }

  // Chunked so SQLite is not handed one enormous statement.
  for (let index = 0; index < rows.length; index += 200) {
    await prisma.sale.createMany({ data: rows.slice(index, index + 200) });
  }

  console.log(`  ${rows.length} sales rows across ${months.length} months.`);
  return unitsByProductMonth;
}

async function seedCogs(
  storeId: string,
  products: { id: string; sku: string | null; name: string }[],
  suppliers: { id: string }[],
  unitsByProductMonth: Map<string, number>,
  months: Date[],
) {
  const bySku = new Map(products.map((product) => [product.sku, product]));
  const supplierBySku = new Map(
    PRODUCTS.map((product) => [product.sku, suppliers[product.supplier].id]),
  );
  const costBySku = new Map(PRODUCTS.map((product) => [product.sku, product.cost]));

  const rows = [];
  let reference = 1200;

  for (const monthStart of months) {
    const monthKey = monthStart.toISOString().slice(0, 7);

    for (const product of PRODUCTS) {
      const units = unitsByProductMonth.get(`${product.sku}|${monthKey}`) ?? 0;
      if (units === 0) continue;

      const record = bySku.get(product.sku);
      if (!record) continue;

      // Landed cost drifts a little month to month, as real purchasing does.
      const unitCost = Math.round((costBySku.get(product.sku) ?? 0) * (0.96 + random() * 0.1));
      const unitCostMinor = rs(unitCost);
      const totalCostMinor = unitCostMinor * BigInt(units);

      reference += 1;

      rows.push({
        storeId,
        date: addDays(monthStart, randomInt(1, 6)),
        productId: record.id,
        productName: product.name,
        sku: product.sku,
        supplierId: supplierBySku.get(product.sku),
        quantity: units,
        unitCostMinor,
        totalCostMinor,
        baseTotalCostMinor: totalCostMinor,
        reference: `PO-${reference}`,
      });
    }
  }

  for (let index = 0; index < rows.length; index += 200) {
    await prisma.cogsEntry.createMany({ data: rows.slice(index, index + 200) });
  }

  console.log(`  ${rows.length} COGS entries.`);
}

/**
 * Suppliers are paid on terms, so most of what was purchased has been settled
 * and a realistic balance is left outstanding.
 */
async function seedSupplierPayments(suppliers: { id: string }[]) {
  let created = 0;

  for (const supplier of suppliers) {
    const purchases = await prisma.cogsEntry.groupBy({
      by: ["supplierId"],
      where: { supplierId: supplier.id, deletedAt: null },
      _sum: { baseTotalCostMinor: true },
    });

    const owed = purchases[0]?._sum.baseTotalCostMinor ?? 0n;
    if (owed === 0n) continue;

    // Settle between 78% and 95% of the balance across a handful of payments.
    const settledPercent = BigInt(randomInt(78, 95));
    let remaining = (owed * settledPercent) / 100n;

    const instalments = randomInt(3, 6);
    for (let index = 0; index < instalments && remaining > 0n; index++) {
      const isLast = index === instalments - 1;
      const amount = isLast ? remaining : remaining / BigInt(instalments - index);
      if (amount <= 0n) break;

      await prisma.supplierPayment.create({
        data: {
          supplierId: supplier.id,
          date: addDays(PERIOD_START, randomInt(10, 220)),
          amountMinor: amount,
          currency: "PKR",
          baseAmountMinor: amount,
          method: pick(["BANK", "CASH", "BANK"] as const),
          reference: `PAY-${randomInt(1000, 9999)}`,
        },
      });

      remaining -= amount;
      created += 1;
    }
  }

  console.log(`  ${created} supplier payments.`);
}

async function seedAdSpend(storeId: string, months: Date[]) {
  const CAMPAIGNS: Record<string, string[]> = {
    META: ["Prospecting - Broad", "Retargeting - 30d", "Lookalike 2% Purchasers", "Ramzan Sale"],
    GOOGLE: ["Search - Brand", "Shopping - All Products", "Performance Max"],
    TIKTOK: ["TikTok - Video Views", "TikTok - Conversions"],
  };

  const rows = [];

  for (const monthStart of months) {
    const monthEnd = endOfMonth(monthStart);
    const lastDay = isAfter(monthEnd, TODAY) ? TODAY : monthEnd;
    const daysInPeriod = Math.max(
      1,
      Math.round((lastDay.getTime() - monthStart.getTime()) / 86_400_000) + 1,
    );

    // Ads are booked weekly, which is how the platforms bill in practice.
    for (let day = 0; day < daysInPeriod; day += 7) {
      const date = addDays(monthStart, day);
      if (isAfter(date, TODAY)) continue;

      const weekFactor = Math.min(1, (daysInPeriod - day) / 7);

      for (const [platform, campaigns] of Object.entries(CAMPAIGNS)) {
        const base =
          platform === "META" ? 26_000 : platform === "GOOGLE" ? 11_000 : 6_500;

        for (const campaign of campaigns) {
          if (random() < 0.25) continue;

          const amount = Math.round(
            ((base / campaigns.length) * (0.7 + random() * 0.8) * weekFactor) / 10,
          ) * 10;
          if (amount <= 0) continue;

          const amountMinor = rs(amount);
          rows.push({
            storeId,
            date,
            platform,
            campaignName: campaign,
            campaignId: `${platform.slice(0, 2)}-${randomInt(100000, 999999)}`,
            amountMinor,
            baseAmountMinor: amountMinor,
            impressions: randomInt(8_000, 90_000),
            clicks: randomInt(120, 2_400),
            conversions: randomInt(2, 48),
          });
        }
      }
    }
  }

  for (let index = 0; index < rows.length; index += 200) {
    await prisma.adSpend.createMany({ data: rows.slice(index, index + 200) });
  }

  console.log(`  ${rows.length} ad spend entries.`);
}

async function seedExpenses(
  storeId: string,
  categories: Map<string, string>,
  months: Date[],
) {
  const rows = [];

  for (const monthStart of months) {
    const isPartialMonth = isAfter(endOfMonth(monthStart), TODAY);
    const dayIn = (day: number) => {
      const date = addDays(startOfMonth(monthStart), day - 1);
      return isAfter(date, TODAY) ? TODAY : date;
    };

    const monthly: {
      name: string;
      category: string;
      amount: number;
      day: number;
      method: string;
      vendor?: string;
    }[] = [
      { name: "Office & warehouse rent", category: "Rent", amount: 45_000, day: 1, method: "BANK", vendor: "Ch. Rashid Properties" },
      { name: "Salary - Ali Hassan (Operations)", category: "Salaries & Wages", amount: 55_000, day: 1, method: "BANK" },
      { name: "Salary - Fatima Noor (Customer Support)", category: "Salaries & Wages", amount: 38_000, day: 1, method: "BANK" },
      { name: "Salary - Usman Ghani (Packing)", category: "Salaries & Wages", amount: 32_000, day: 1, method: "CASH" },
      { name: "Shopify subscription", category: "Software & Subscriptions", amount: 11_200, day: 3, method: "CARD", vendor: "Shopify Inc." },
      { name: "Klaviyo email marketing", category: "Software & Subscriptions", amount: 8_400, day: 3, method: "CARD", vendor: "Klaviyo" },
      { name: "Canva Pro", category: "Software & Subscriptions", amount: 3_600, day: 5, method: "CARD", vendor: "Canva" },
      { name: "Internet - StormFiber", category: "Internet", amount: 4_500, day: 7, method: "JAZZCASH", vendor: "StormFiber" },
      { name: "Electricity bill", category: "Utilities", amount: randomInt(14_000, 26_000), day: 12, method: "BANK", vendor: "LESCO" },
      { name: "Courier charges - Leopards", category: "Shipping & Courier", amount: randomInt(58_000, 92_000), day: 15, method: "BANK", vendor: "Leopards Courier" },
      { name: "Packaging boxes & bubble wrap", category: "Packaging", amount: randomInt(22_000, 38_000), day: 8, method: "CASH", vendor: "Pak Packaging Co." },
      { name: "Return shipping (RTO)", category: "Returns & RTO", amount: randomInt(12_000, 24_000), day: 22, method: "BANK", vendor: "Leopards Courier" },
      { name: "Bank charges", category: "Bank Charges", amount: randomInt(1_800, 3_400), day: 28, method: "BANK" },
      { name: "Office supplies & tea", category: "Office Expenses", amount: randomInt(4_000, 9_000), day: 18, method: "CASH" },
      { name: "Fuel & local delivery", category: "Travel & Transport", amount: randomInt(8_000, 15_000), day: 20, method: "CASH" },
    ];

    // Quarterly and annual items.
    if ([0, 3, 6, 9].includes(monthStart.getMonth())) {
      monthly.push({
        name: "Accountant - quarterly filing",
        category: "Professional Services",
        amount: 25_000,
        day: 10,
        method: "BANK",
        vendor: "Siddiqui & Co. Chartered Accountants",
      });
    }
    if (monthStart.getMonth() === 2) {
      monthly.push({ name: "Zakat", category: "Zakat & Donations", amount: 185_000, day: 14, method: "BANK" });
    }
    if (random() < 0.35) {
      monthly.push({
        name: "Product photoshoot",
        category: "Marketing (non-ads)",
        amount: randomInt(18_000, 40_000),
        day: randomInt(5, 24),
        method: "CASH",
        vendor: "Studio 47",
      });
    }

    for (const expense of monthly) {
      const date = dayIn(expense.day);
      if (isAfter(date, TODAY)) continue;

      // Partial current month: only post what has genuinely fallen due.
      if (isPartialMonth && expense.day > TODAY.getDate()) continue;

      const categoryId = categories.get(expense.category);
      const amountMinor = rs(expense.amount);

      rows.push({
        storeId,
        date,
        name: expense.name,
        categoryId,
        amountMinor,
        baseAmountMinor: amountMinor,
        paymentMethod: expense.method,
        vendorName: expense.vendor,
      });
    }
  }

  for (let index = 0; index < rows.length; index += 200) {
    await prisma.expense.createMany({ data: rows.slice(index, index + 200) });
  }

  console.log(`  ${rows.length} expenses.`);
}

async function seedRecurringExpenses(storeId: string, categories: Map<string, string>) {
  const templates = [
    { name: "Office & warehouse rent", category: "Rent", amount: 45_000, day: 1 },
    { name: "Shopify subscription", category: "Software & Subscriptions", amount: 11_200, day: 3 },
    { name: "Klaviyo email marketing", category: "Software & Subscriptions", amount: 8_400, day: 3 },
    { name: "Internet - StormFiber", category: "Internet", amount: 4_500, day: 7 },
    { name: "Salary - Ali Hassan (Operations)", category: "Salaries & Wages", amount: 55_000, day: 1 },
  ];

  for (const template of templates) {
    const amountMinor = rs(template.amount);
    await prisma.recurringExpense.create({
      data: {
        storeId,
        name: template.name,
        categoryId: categories.get(template.category),
        amountMinor,
        baseAmountMinor: amountMinor,
        frequency: "MONTHLY",
        startDate: PERIOD_START,
        dayOfMonth: template.day,
        paymentMethod: "BANK",
        isActive: true,
        lastGeneratedDate: startOfMonth(TODAY),
      },
    });
  }

  console.log(`  ${templates.length} recurring expense schedules.`);
}

async function seedCashEntries(storeId: string, months: Date[]) {
  const rows = [];

  for (const monthStart of months) {
    if (random() < 0.4) {
      const amount = rs(randomInt(15_000, 60_000));
      rows.push({
        storeId,
        date: addDays(monthStart, randomInt(4, 24)),
        direction: "IN",
        category: "OTHER_INCOME",
        name: "Wholesale order - retail partner",
        amountMinor: amount,
        baseAmountMinor: amount,
      });
    }
    if (random() < 0.5) {
      const amount = rs(randomInt(40_000, 120_000));
      rows.push({
        storeId,
        date: addDays(monthStart, randomInt(20, 27)),
        direction: "OUT",
        category: "DRAWINGS",
        name: "Owner drawings",
        amountMinor: amount,
        baseAmountMinor: amount,
      });
    }
  }

  const capital = rs(500_000);
  rows.push({
    storeId,
    date: addDays(PERIOD_START, 3),
    direction: "IN",
    category: "CAPITAL",
    name: "Additional capital introduced",
    amountMinor: capital,
    baseAmountMinor: capital,
  });

  const filtered = rows.filter((row) => !isAfter(row.date, TODAY));
  await prisma.cashEntry.createMany({ data: filtered });
  console.log(`  ${filtered.length} manual cash entries.`);
}

main()
  .catch((error) => {
    console.error("\nSeeding failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
