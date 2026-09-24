import { prisma } from "./db";
import { percentOf, sumMoney, mulDiv } from "./money";
import { bucketKeyFor, bucketsFor, monthBucketsFor } from "./dates";
import type { CategoryKind } from "./constants";

// ---------------------------------------------------------------------------
// Revenue recognition
//
// A cancelled order never produced money, and a returned order gave the money
// back. Neither is revenue. This single predicate is used everywhere so the
// dashboard, the P&L and the reports can never disagree with each other.
// ---------------------------------------------------------------------------

export const EXCLUDED_FROM_REVENUE = ["CANCELLED", "RETURNED"];

export const recognisedSaleWhere = {
  deletedAt: null,
  isCancelled: false,
  OR: [{ fulfillmentStatus: null }, { fulfillmentStatus: { notIn: EXCLUDED_FROM_REVENUE } }],
};

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

export interface DateWindow {
  from: Date;
  to: Date;
}

interface SaleRow {
  date: Date;
  orderId: string;
  channel: string;
  quantity: number;
  grossAmountMinor: bigint;
  discountMinor: bigint;
  refundMinor: bigint;
  shippingRevenueMinor: bigint;
  paymentFeeMinor: bigint;
  baseNetRevenueMinor: bigint;
  productId: string | null;
  productName: string | null;
  fulfillmentStatus: string | null;
  isCancelled: boolean;
}

interface CogsRow {
  date: Date;
  productId: string | null;
  productName: string;
  sku: string | null;
  supplierId: string | null;
  quantity: number;
  baseTotalCostMinor: bigint;
}

interface AdRow {
  date: Date;
  platform: string;
  campaignName: string | null;
  baseAmountMinor: bigint;
}

interface ExpenseRow {
  date: Date;
  name: string;
  baseAmountMinor: bigint;
  categoryId: string | null;
  categoryName: string;
  categoryKind: CategoryKind;
  categoryColor: string | null;
}

interface CashRow {
  date: Date;
  direction: string;
  category: string;
  name: string;
  baseAmountMinor: bigint;
}

export interface FinancialDataset {
  window: DateWindow;
  sales: SaleRow[];
  allSales: SaleRow[]; // includes cancelled/returned, for order-count context
  cogs: CogsRow[];
  adSpend: AdRow[];
  expenses: ExpenseRow[];
  cashEntries: CashRow[];
}

/**
 * One trip to the database for everything the finance layer needs. Every
 * downstream calculation is a pure function over this object.
 */
export async function loadDataset(storeId: string, window: DateWindow): Promise<FinancialDataset> {
  const range = { gte: window.from, lte: window.to };

  const [allSales, cogs, adSpend, expenses, cashEntries] = await Promise.all([
    prisma.sale.findMany({
      where: { storeId, deletedAt: null, date: range },
      select: {
        date: true,
        orderId: true,
        channel: true,
        quantity: true,
        grossAmountMinor: true,
        discountMinor: true,
        refundMinor: true,
        shippingRevenueMinor: true,
        paymentFeeMinor: true,
        baseNetRevenueMinor: true,
        productId: true,
        productName: true,
        fulfillmentStatus: true,
        isCancelled: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.cogsEntry.findMany({
      where: { storeId, deletedAt: null, date: range },
      select: {
        date: true,
        productId: true,
        productName: true,
        sku: true,
        supplierId: true,
        quantity: true,
        baseTotalCostMinor: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.adSpend.findMany({
      where: { storeId, deletedAt: null, date: range },
      select: { date: true, platform: true, campaignName: true, baseAmountMinor: true },
      orderBy: { date: "asc" },
    }),
    prisma.expense.findMany({
      where: { storeId, deletedAt: null, date: range },
      select: {
        date: true,
        name: true,
        baseAmountMinor: true,
        categoryId: true,
        category: { select: { name: true, kind: true, color: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.cashEntry.findMany({
      where: { storeId, deletedAt: null, date: range },
      select: {
        date: true,
        direction: true,
        category: true,
        name: true,
        baseAmountMinor: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const mappedExpenses: ExpenseRow[] = expenses.map((expense) => ({
    date: expense.date,
    name: expense.name,
    baseAmountMinor: expense.baseAmountMinor,
    categoryId: expense.categoryId,
    categoryName: expense.category?.name ?? "Uncategorised",
    categoryKind: (expense.category?.kind ?? "OPERATING") as CategoryKind,
    categoryColor: expense.category?.color ?? null,
  }));

  return {
    window,
    allSales,
    sales: allSales.filter(isRecognisedRevenue),
    cogs,
    adSpend,
    expenses: mappedExpenses,
    cashEntries,
  };
}

function isRecognisedRevenue(sale: SaleRow): boolean {
  if (sale.isCancelled) return false;
  if (sale.fulfillmentStatus && EXCLUDED_FROM_REVENUE.includes(sale.fulfillmentStatus)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Headline summary
// ---------------------------------------------------------------------------

export interface FinancialSummary {
  grossRevenue: bigint;
  discounts: bigint;
  refunds: bigint;
  shippingRevenue: bigint;
  netRevenue: bigint;

  cogs: bigint;
  directCosts: bigint;
  grossProfit: bigint;
  grossMarginPct: number | null;

  paymentFees: bigint;
  fulfilmentExpenses: bigint;
  adSpend: bigint;
  operatingExpenses: bigint;
  totalOperatingCosts: bigint;

  netProfit: bigint;
  netProfitMarginPct: number | null;

  otherAppropriations: bigint;
  profitAfterAppropriations: bigint;

  orders: number;
  ordersAll: number;
  ordersCancelled: number;
  ordersReturned: number;
  units: number;
  averageOrderValue: bigint;

  cashIn: bigint;
  cashOut: bigint;
  netCashFlow: bigint;

  roas: number | null;
  tacosPct: number | null;
  cogsPctOfRevenue: number | null;
  adSpendPctOfRevenue: number | null;
}

export function summarise(dataset: FinancialDataset): FinancialSummary {
  const { sales, allSales, cogs, adSpend, expenses, cashEntries } = dataset;

  const grossRevenue = sumMoney(sales.map((s) => s.grossAmountMinor));
  const discounts = sumMoney(sales.map((s) => s.discountMinor));
  const refunds = sumMoney(sales.map((s) => s.refundMinor));
  const shippingRevenue = sumMoney(sales.map((s) => s.shippingRevenueMinor));
  const paymentFees = sumMoney(sales.map((s) => s.paymentFeeMinor));
  const netRevenue = sumMoney(sales.map((s) => s.baseNetRevenueMinor));

  const cogsTotal = sumMoney(cogs.map((c) => c.baseTotalCostMinor));
  const adSpendTotal = sumMoney(adSpend.map((a) => a.baseAmountMinor));

  const fulfilmentExpenses = sumMoney(
    expenses.filter((e) => e.categoryKind === "FULFILMENT").map((e) => e.baseAmountMinor),
  );
  const operatingExpenses = sumMoney(
    expenses.filter((e) => e.categoryKind === "OPERATING").map((e) => e.baseAmountMinor),
  );
  const otherAppropriations = sumMoney(
    expenses.filter((e) => e.categoryKind === "OTHER").map((e) => e.baseAmountMinor),
  );

  // Gross profit is net of every *direct* cost of delivering the order: the
  // product itself, the fulfilment categories and the payment processing fee.
  // Anything a category is marked FULFILMENT sits here, which is what makes the
  // statement add up in the same order it is read.
  const directCosts = cogsTotal + fulfilmentExpenses + paymentFees;
  const grossProfit = netRevenue - directCosts;

  const totalOperatingCosts = adSpendTotal + operatingExpenses;
  const netProfit = grossProfit - totalOperatingCosts;

  const orders = countOrders(sales);
  const units = sales.reduce((total, sale) => total + sale.quantity, 0);
  const averageOrderValue = orders > 0 ? netRevenue / BigInt(orders) : 0n;

  const salesCashIn = netRevenue;
  const manualCashIn = sumMoney(
    cashEntries.filter((c) => c.direction === "IN").map((c) => c.baseAmountMinor),
  );
  const manualCashOut = sumMoney(
    cashEntries.filter((c) => c.direction === "OUT").map((c) => c.baseAmountMinor),
  );

  const cashIn = salesCashIn + manualCashIn;
  const cashOut =
    cogsTotal +
    adSpendTotal +
    fulfilmentExpenses +
    operatingExpenses +
    otherAppropriations +
    paymentFees +
    manualCashOut;

  return {
    grossRevenue,
    discounts,
    refunds,
    shippingRevenue,
    netRevenue,

    cogs: cogsTotal,
    directCosts,
    grossProfit,
    grossMarginPct: percentOf(grossProfit, netRevenue),

    paymentFees,
    fulfilmentExpenses,
    adSpend: adSpendTotal,
    operatingExpenses,
    totalOperatingCosts,

    netProfit,
    netProfitMarginPct: percentOf(netProfit, netRevenue),

    otherAppropriations,
    profitAfterAppropriations: netProfit - otherAppropriations,

    orders,
    ordersAll: countOrders(allSales),
    ordersCancelled: countOrders(allSales.filter((s) => s.isCancelled)),
    ordersReturned: countOrders(allSales.filter((s) => s.fulfillmentStatus === "RETURNED")),
    units,
    averageOrderValue,

    cashIn,
    cashOut,
    netCashFlow: cashIn - cashOut,

    roas: adSpendTotal === 0n ? null : Number(mulDiv(netRevenue, 10_000n, adSpendTotal)) / 10_000,
    tacosPct: percentOf(adSpendTotal, netRevenue),
    cogsPctOfRevenue: percentOf(cogsTotal, netRevenue),
    adSpendPctOfRevenue: percentOf(adSpendTotal, netRevenue),
  };
}

/** Distinct order IDs — a multi-line order must not count as several orders. */
function countOrders(sales: { orderId: string }[]): number {
  const seen = new Set<string>();
  for (const sale of sales) {
    seen.add(sale.orderId || `__row_${seen.size}`);
  }
  return seen.size;
}

// ---------------------------------------------------------------------------
// Time series for the dashboard charts
// ---------------------------------------------------------------------------

// A type alias rather than an interface: object type aliases carry an implicit
// index signature, which is what lets these rows be handed straight to Recharts.
export type SeriesPoint = {
  key: string;
  label: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  adSpend: number;
  expenses: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
  orders: number;
};

export function buildTimeSeries(dataset: FinancialDataset): {
  granularity: "day" | "month";
  points: SeriesPoint[];
} {
  const { granularity, buckets } = bucketsFor(dataset.window);

  const revenue = new Map<string, bigint>();
  const cogs = new Map<string, bigint>();
  const ads = new Map<string, bigint>();
  const opex = new Map<string, bigint>();
  const cashInExtra = new Map<string, bigint>();
  const cashOutExtra = new Map<string, bigint>();
  const orderIds = new Map<string, Set<string>>();

  const add = (map: Map<string, bigint>, key: string, value: bigint) => {
    map.set(key, (map.get(key) ?? 0n) + value);
  };

  for (const sale of dataset.sales) {
    const key = bucketKeyFor(sale.date, granularity);
    add(revenue, key, sale.baseNetRevenueMinor);
    if (!orderIds.has(key)) orderIds.set(key, new Set());
    orderIds.get(key)!.add(sale.orderId || `__row_${orderIds.get(key)!.size}`);
  }

  for (const entry of dataset.cogs) {
    add(cogs, bucketKeyFor(entry.date, granularity), entry.baseTotalCostMinor);
  }

  for (const entry of dataset.adSpend) {
    add(ads, bucketKeyFor(entry.date, granularity), entry.baseAmountMinor);
  }

  // Split by kind so the chart's profit line matches the KPI cards exactly.
  const fulfilment = new Map<string, bigint>();
  const appropriations = new Map<string, bigint>();

  for (const expense of dataset.expenses) {
    const key = bucketKeyFor(expense.date, granularity);
    const target =
      expense.categoryKind === "FULFILMENT"
        ? fulfilment
        : expense.categoryKind === "OTHER"
          ? appropriations
          : opex;
    add(target, key, expense.baseAmountMinor);
  }

  for (const entry of dataset.cashEntries) {
    const key = bucketKeyFor(entry.date, granularity);
    add(entry.direction === "IN" ? cashInExtra : cashOutExtra, key, entry.baseAmountMinor);
  }

  const paymentFees = new Map<string, bigint>();
  for (const sale of dataset.sales) {
    add(paymentFees, bucketKeyFor(sale.date, granularity), sale.paymentFeeMinor);
  }

  const points = buckets.map((bucket) => {
    const revenueValue = revenue.get(bucket.key) ?? 0n;
    const cogsValue = cogs.get(bucket.key) ?? 0n;
    const adValue = ads.get(bucket.key) ?? 0n;
    const operatingValue = opex.get(bucket.key) ?? 0n;
    const fulfilmentValue = fulfilment.get(bucket.key) ?? 0n;
    const appropriationValue = appropriations.get(bucket.key) ?? 0n;
    const feeValue = paymentFees.get(bucket.key) ?? 0n;

    const grossProfit = revenueValue - cogsValue - fulfilmentValue - feeValue;
    const netProfit = grossProfit - adValue - operatingValue;

    const cashIn = revenueValue + (cashInExtra.get(bucket.key) ?? 0n);
    const cashOut =
      cogsValue +
      adValue +
      operatingValue +
      fulfilmentValue +
      appropriationValue +
      feeValue +
      (cashOutExtra.get(bucket.key) ?? 0n);

    return {
      key: bucket.key,
      label: bucket.label,
      revenue: toChartNumber(revenueValue),
      cogs: toChartNumber(cogsValue),
      grossProfit: toChartNumber(grossProfit),
      adSpend: toChartNumber(adValue),
      expenses: toChartNumber(operatingValue + fulfilmentValue + feeValue),
      netProfit: toChartNumber(netProfit),
      cashIn: toChartNumber(cashIn),
      cashOut: toChartNumber(cashOut),
      netCashFlow: toChartNumber(cashIn - cashOut),
      orders: orderIds.get(bucket.key)?.size ?? 0,
    };
  });

  return { granularity, points };
}

/** Charts take plain numbers in major units. Display only. */
function toChartNumber(minor: bigint): number {
  return Number(minor) / 100;
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

export interface Breakdown {
  key: string;
  label: string;
  amount: bigint;
  amountMajor: number;
  sharePct: number | null;
  color?: string | null;
  count: number;
}

export function breakdownExpensesByCategory(dataset: FinancialDataset): Breakdown[] {
  const groups = new Map<string, { amount: bigint; count: number; color: string | null }>();

  for (const expense of dataset.expenses) {
    const existing = groups.get(expense.categoryName) ?? {
      amount: 0n,
      count: 0,
      color: expense.categoryColor,
    };
    existing.amount += expense.baseAmountMinor;
    existing.count += 1;
    groups.set(expense.categoryName, existing);
  }

  return toBreakdown(groups);
}

export function breakdownAdSpendByPlatform(dataset: FinancialDataset): Breakdown[] {
  const groups = new Map<string, { amount: bigint; count: number; color: string | null }>();

  for (const entry of dataset.adSpend) {
    const existing = groups.get(entry.platform) ?? { amount: 0n, count: 0, color: null };
    existing.amount += entry.baseAmountMinor;
    existing.count += 1;
    groups.set(entry.platform, existing);
  }

  return toBreakdown(groups);
}

export function breakdownAdSpendByCampaign(dataset: FinancialDataset): Breakdown[] {
  const groups = new Map<string, { amount: bigint; count: number; color: string | null }>();

  for (const entry of dataset.adSpend) {
    const label = entry.campaignName?.trim() || "(no campaign name)";
    const existing = groups.get(label) ?? { amount: 0n, count: 0, color: null };
    existing.amount += entry.baseAmountMinor;
    existing.count += 1;
    groups.set(label, existing);
  }

  return toBreakdown(groups);
}

export function breakdownRevenueByChannel(dataset: FinancialDataset): Breakdown[] {
  const groups = new Map<string, { amount: bigint; count: number; color: string | null }>();

  for (const sale of dataset.sales) {
    const existing = groups.get(sale.channel) ?? { amount: 0n, count: 0, color: null };
    existing.amount += sale.baseNetRevenueMinor;
    existing.count += 1;
    groups.set(sale.channel, existing);
  }

  return toBreakdown(groups);
}

export function breakdownCogsByProduct(dataset: FinancialDataset): Breakdown[] {
  const groups = new Map<string, { amount: bigint; count: number; color: string | null }>();

  for (const entry of dataset.cogs) {
    const label = entry.productName?.trim() || entry.sku?.trim() || "(unnamed product)";
    const existing = groups.get(label) ?? { amount: 0n, count: 0, color: null };
    existing.amount += entry.baseTotalCostMinor;
    existing.count += entry.quantity;
    groups.set(label, existing);
  }

  return toBreakdown(groups);
}

function toBreakdown(
  groups: Map<string, { amount: bigint; count: number; color: string | null }>,
): Breakdown[] {
  const total = sumMoney([...groups.values()].map((group) => group.amount));

  return [...groups.entries()]
    .map(([label, group]) => ({
      key: label,
      label,
      amount: group.amount,
      amountMajor: toChartNumber(group.amount),
      sharePct: percentOf(group.amount, total),
      color: group.color,
      count: group.count,
    }))
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
}

// ---------------------------------------------------------------------------
// Product profitability
// ---------------------------------------------------------------------------

export interface ProductProfitability {
  productId: string | null;
  name: string;
  sku: string | null;
  unitsSold: number;
  revenue: bigint;
  cogs: bigint;
  grossProfit: bigint;
  marginPct: number | null;
}

export function productProfitability(dataset: FinancialDataset): ProductProfitability[] {
  const rows = new Map<
    string,
    { name: string; sku: string | null; productId: string | null; revenue: bigint; units: number; cogs: bigint }
  >();

  const keyFor = (productId: string | null, name: string | null, sku?: string | null) =>
    productId ?? `name:${(name ?? sku ?? "unknown").trim().toLowerCase()}`;

  for (const sale of dataset.sales) {
    if (!sale.productName && !sale.productId) continue;
    const key = keyFor(sale.productId, sale.productName);
    const row = rows.get(key) ?? {
      name: sale.productName ?? "(unnamed)",
      sku: null,
      productId: sale.productId,
      revenue: 0n,
      units: 0,
      cogs: 0n,
    };
    row.revenue += sale.baseNetRevenueMinor;
    row.units += sale.quantity;
    rows.set(key, row);
  }

  for (const entry of dataset.cogs) {
    const key = keyFor(entry.productId, entry.productName, entry.sku);
    const row = rows.get(key) ?? {
      name: entry.productName,
      sku: entry.sku,
      productId: entry.productId,
      revenue: 0n,
      units: 0,
      cogs: 0n,
    };
    row.cogs += entry.baseTotalCostMinor;
    if (!row.sku) row.sku = entry.sku;
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => {
      const grossProfit = row.revenue - row.cogs;
      return {
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        unitsSold: row.units,
        revenue: row.revenue,
        cogs: row.cogs,
        grossProfit,
        marginPct: percentOf(grossProfit, row.revenue),
      };
    })
    .sort((a, b) => (b.grossProfit > a.grossProfit ? 1 : b.grossProfit < a.grossProfit ? -1 : 0));
}

// ---------------------------------------------------------------------------
// Profit & loss statement
// ---------------------------------------------------------------------------

export interface PLLine {
  id: string;
  label: string;
  values: bigint[];
  total: bigint;
  level: 0 | 1 | 2;
  emphasis?: "subtotal" | "total" | "none";
  isNegative?: boolean;
  marginPct?: (number | null)[];
  totalMarginPct?: number | null;
}

export interface ProfitAndLoss {
  columns: { key: string; label: string }[];
  lines: PLLine[];
  totals: FinancialSummary;
}

export function buildProfitAndLoss(
  dataset: FinancialDataset,
  columnGranularity: "month" | "single" = "month",
): ProfitAndLoss {
  const columns =
    columnGranularity === "single"
      ? [{ key: "all", label: "Total", start: dataset.window.from, end: dataset.window.to }]
      : monthBucketsFor(dataset.window);

  const columnDatasets = columns.map((column) => filterDataset(dataset, column.start, column.end));
  const summaries = columnDatasets.map(summarise);
  const grandTotal = summarise(dataset);

  const pick = (selector: (summary: FinancialSummary) => bigint) => summaries.map(selector);

  const operatingCategories = collectCategoryLines(columnDatasets, "OPERATING");
  const fulfilmentCategories = collectCategoryLines(columnDatasets, "FULFILMENT");
  const otherCategories = collectCategoryLines(columnDatasets, "OTHER");

  const lines: PLLine[] = [
    line("revenue-header", "REVENUE", [], 0n, 0, "none"),
    line("gross-sales", "Gross sales", pick((s) => s.grossRevenue), grandTotal.grossRevenue, 1),
    line("discounts", "Less: discounts", pick((s) => s.discounts), grandTotal.discounts, 1, "none", true),
    line("refunds", "Less: refunds", pick((s) => s.refunds), grandTotal.refunds, 1, "none", true),
    line(
      "shipping-revenue",
      "Shipping income",
      pick((s) => s.shippingRevenue),
      grandTotal.shippingRevenue,
      1,
    ),
    line("net-revenue", "NET REVENUE", pick((s) => s.netRevenue), grandTotal.netRevenue, 0, "subtotal"),

    line("cogs-header", "COST OF GOODS SOLD", [], 0n, 0, "none"),
    line("cogs", "Product cost", pick((s) => s.cogs), grandTotal.cogs, 1, "none", true),
    ...fulfilmentCategories.lines,
    line(
      "payment-fees",
      "Payment processing fees",
      pick((s) => s.paymentFees),
      grandTotal.paymentFees,
      1,
      "none",
      true,
    ),

    line(
      "gross-profit",
      "GROSS PROFIT",
      pick((s) => s.grossProfit),
      grandTotal.grossProfit,
      0,
      "subtotal",
      false,
      summaries.map((s) => s.grossMarginPct),
      grandTotal.grossMarginPct,
    ),

    line("opex-header", "OPERATING EXPENSES", [], 0n, 0, "none"),
    line("advertising", "Advertising & marketing", pick((s) => s.adSpend), grandTotal.adSpend, 1, "none", true),
    ...operatingCategories.lines,
    line(
      "total-opex",
      "Total operating expenses",
      pick((s) => s.totalOperatingCosts),
      grandTotal.totalOperatingCosts,
      1,
      "subtotal",
      true,
    ),

    line(
      "net-profit",
      "NET PROFIT",
      pick((s) => s.netProfit),
      grandTotal.netProfit,
      0,
      "total",
      false,
      summaries.map((s) => s.netProfitMarginPct),
      grandTotal.netProfitMarginPct,
    ),
  ];

  if (otherCategories.lines.length > 0) {
    lines.push(
      line("appropriations-header", "BELOW THE LINE", [], 0n, 0, "none"),
      ...otherCategories.lines,
      line(
        "profit-after",
        "PROFIT AFTER APPROPRIATIONS",
        pick((s) => s.profitAfterAppropriations),
        grandTotal.profitAfterAppropriations,
        0,
        "subtotal",
      ),
    );
  }

  return {
    columns: columns.map(({ key, label }) => ({ key, label })),
    lines,
    totals: grandTotal,
  };
}

function line(
  id: string,
  label: string,
  values: bigint[],
  total: bigint,
  level: 0 | 1 | 2,
  emphasis: "subtotal" | "total" | "none" = "none",
  isNegative = false,
  marginPct?: (number | null)[],
  totalMarginPct?: number | null,
): PLLine {
  return { id, label, values, total, level, emphasis, isNegative, marginPct, totalMarginPct };
}

function collectCategoryLines(
  columnDatasets: FinancialDataset[],
  kind: CategoryKind,
): { lines: PLLine[] } {
  const names = new Set<string>();
  for (const dataset of columnDatasets) {
    for (const expense of dataset.expenses) {
      if (expense.categoryKind === kind) names.add(expense.categoryName);
    }
  }

  const lines = [...names].sort().map((name) => {
    const values = columnDatasets.map((dataset) =>
      sumMoney(
        dataset.expenses
          .filter((expense) => expense.categoryKind === kind && expense.categoryName === name)
          .map((expense) => expense.baseAmountMinor),
      ),
    );
    return line(`cat-${kind}-${name}`, name, values, sumMoney(values), 1, "none", true);
  });

  return { lines };
}

export function filterDataset(dataset: FinancialDataset, from: Date, to: Date): FinancialDataset {
  const inWindow = (date: Date) => date >= from && date <= to;

  return {
    window: { from, to },
    allSales: dataset.allSales.filter((row) => inWindow(row.date)),
    sales: dataset.sales.filter((row) => inWindow(row.date)),
    cogs: dataset.cogs.filter((row) => inWindow(row.date)),
    adSpend: dataset.adSpend.filter((row) => inWindow(row.date)),
    expenses: dataset.expenses.filter((row) => inWindow(row.date)),
    cashEntries: dataset.cashEntries.filter((row) => inWindow(row.date)),
  };
}

// ---------------------------------------------------------------------------
// Cash flow
// ---------------------------------------------------------------------------

export interface CashFlowLine {
  label: string;
  amount: bigint;
  detail?: string;
}

export interface CashFlowStatement {
  openingBalance: bigint;
  cashIn: CashFlowLine[];
  cashOut: CashFlowLine[];
  totalIn: bigint;
  totalOut: bigint;
  netMovement: bigint;
  closingBalance: bigint;
}

export async function buildCashFlow(
  storeId: string,
  dataset: FinancialDataset,
): Promise<CashFlowStatement> {
  const openingBalance = await computeOpeningBalance(storeId, dataset.window.from);
  const summary = summarise(dataset);

  const otherIncome = dataset.cashEntries.filter((entry) => entry.direction === "IN");
  const otherPayments = dataset.cashEntries.filter((entry) => entry.direction === "OUT");

  const cashIn: CashFlowLine[] = [
    {
      label: "Receipts from sales",
      amount: summary.netRevenue,
      detail: `${summary.orders} order${summary.orders === 1 ? "" : "s"}`,
    },
    ...groupCashEntries(otherIncome),
  ];

  const cashOut: CashFlowLine[] = [
    { label: "Stock purchases (COGS)", amount: summary.cogs },
    { label: "Advertising", amount: summary.adSpend },
    { label: "Fulfilment & delivery", amount: summary.fulfilmentExpenses },
    { label: "Payment processing fees", amount: summary.paymentFees },
    { label: "Operating expenses", amount: summary.operatingExpenses },
    ...(summary.otherAppropriations > 0n
      ? [{ label: "Zakat, drawings & tax", amount: summary.otherAppropriations }]
      : []),
    ...groupCashEntries(otherPayments),
  ].filter((row) => row.amount !== 0n);

  const totalIn = sumMoney(cashIn.map((row) => row.amount));
  const totalOut = sumMoney(cashOut.map((row) => row.amount));

  return {
    openingBalance,
    cashIn: cashIn.filter((row) => row.amount !== 0n),
    cashOut,
    totalIn,
    totalOut,
    netMovement: totalIn - totalOut,
    closingBalance: openingBalance + totalIn - totalOut,
  };
}

function groupCashEntries(entries: CashRow[]): CashFlowLine[] {
  const groups = new Map<string, bigint>();
  for (const entry of entries) {
    groups.set(entry.category, (groups.get(entry.category) ?? 0n) + entry.baseAmountMinor);
  }
  return [...groups.entries()].map(([category, amount]) => ({
    label: humaniseCashCategory(category),
    amount,
  }));
}

function humaniseCashCategory(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Opening balance = declared account openings + every movement that happened
 * before the start of the period. Computed rather than stored, so it can never
 * drift out of step with the underlying transactions.
 */
async function computeOpeningBalance(storeId: string, from: Date): Promise<bigint> {
  const [accounts, priorSales, priorCogs, priorAds, priorExpenses, priorCash] = await Promise.all([
    prisma.cashAccount.findMany({
      where: { storeId, deletedAt: null },
      select: { openingBalanceMinor: true },
    }),
    prisma.sale.aggregate({
      where: { storeId, ...recognisedSaleWhere, date: { lt: from } },
      _sum: { baseNetRevenueMinor: true, paymentFeeMinor: true },
    }),
    prisma.cogsEntry.aggregate({
      where: { storeId, deletedAt: null, date: { lt: from } },
      _sum: { baseTotalCostMinor: true },
    }),
    prisma.adSpend.aggregate({
      where: { storeId, deletedAt: null, date: { lt: from } },
      _sum: { baseAmountMinor: true },
    }),
    prisma.expense.aggregate({
      where: { storeId, deletedAt: null, date: { lt: from } },
      _sum: { baseAmountMinor: true },
    }),
    prisma.cashEntry.groupBy({
      by: ["direction"],
      where: { storeId, deletedAt: null, date: { lt: from } },
      _sum: { baseAmountMinor: true },
    }),
  ]);

  const declaredOpening = sumMoney(accounts.map((account) => account.openingBalanceMinor));

  const inflow = priorSales._sum.baseNetRevenueMinor ?? 0n;
  const fees = priorSales._sum.paymentFeeMinor ?? 0n;
  const outflow =
    (priorCogs._sum.baseTotalCostMinor ?? 0n) +
    (priorAds._sum.baseAmountMinor ?? 0n) +
    (priorExpenses._sum.baseAmountMinor ?? 0n) +
    fees;

  let manualIn = 0n;
  let manualOut = 0n;
  for (const group of priorCash) {
    if (group.direction === "IN") manualIn += group._sum.baseAmountMinor ?? 0n;
    else manualOut += group._sum.baseAmountMinor ?? 0n;
  }

  return declaredOpening + inflow + manualIn - outflow - manualOut;
}

// ---------------------------------------------------------------------------
// Period-on-period comparison
// ---------------------------------------------------------------------------

export interface Delta {
  absolute: bigint;
  percent: number | null;
  direction: "up" | "down" | "flat";
}

export function deltaOf(current: bigint, previous: bigint): Delta {
  const absolute = current - previous;
  return {
    absolute,
    percent: previous === 0n ? null : percentOf(absolute, previous < 0n ? -previous : previous),
    direction: absolute > 0n ? "up" : absolute < 0n ? "down" : "flat",
  };
}
