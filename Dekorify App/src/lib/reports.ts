import { prisma } from "./db";
import { formatMoney, formatPercent, formatNumber } from "./currency";
import { formatDate, formatMonth, monthBucketsFor } from "./dates";
import { toDecimalString } from "./money";
import {
  filterDataset,
  loadDataset,
  productProfitability,
  summarise,
  recognisedSaleWhere,
  type DateWindow,
} from "./finance";
import { adPlatformLabel, fulfillmentLabel, paymentMethodLabel } from "./constants";
import { deliveryPerformance } from "./orders/queries";
import { ISSUE_STATUSES, statusLabel } from "./orders/statuses";

export type ReportId =
  | "profit-loss"
  | "revenue"
  | "expenses"
  | "cogs"
  | "advertising"
  | "product-profitability"
  | "cash-flow"
  | "monthly-summary"
  | "delivery-performance"
  | "courier-performance"
  | "problem-orders";

export interface ReportDefinition {
  id: ReportId;
  title: string;
  description: string;
  /** Reports with their own dedicated page link there instead of rendering a table. */
  href?: string;
  filters: ("category" | "platform" | "supplier" | "channel" | "product")[];
}

export const REPORTS: ReportDefinition[] = [
  {
    id: "monthly-summary",
    title: "Monthly financial summary",
    description: "Revenue, costs and profit for every month, side by side.",
    filters: [],
  },
  {
    id: "profit-loss",
    title: "Profit & loss",
    description: "The full statement from gross sales down to net profit.",
    href: "/profit-loss",
    filters: [],
  },
  {
    id: "revenue",
    title: "Revenue report",
    description: "Every order with its discounts, refunds and net revenue.",
    filters: ["channel"],
  },
  {
    id: "expenses",
    title: "Expense report",
    description: "All expenses, grouped by category and vendor.",
    filters: ["category"],
  },
  {
    id: "cogs",
    title: "COGS report",
    description: "Stock purchases by product, SKU and supplier.",
    filters: ["supplier"],
  },
  {
    id: "advertising",
    title: "Advertising report",
    description: "Ad spend by platform and campaign, with clicks and conversions.",
    filters: ["platform"],
  },
  {
    id: "product-profitability",
    title: "Product profitability",
    description: "Revenue, cost and margin for every product you sold.",
    filters: [],
  },
  {
    id: "cash-flow",
    title: "Cash flow",
    description: "Opening balance, money in, money out and closing balance.",
    href: "/cash-flow",
    filters: [],
  },
  {
    id: "delivery-performance",
    title: "Delivery performance",
    description: "Success rate, average delivery time and attempts per shipment.",
    filters: [],
  },
  {
    id: "courier-performance",
    title: "Courier performance",
    description: "Delivered, failed and returned percentages for each courier.",
    filters: [],
  },
  {
    id: "problem-orders",
    title: "Problem orders",
    description: "Failed deliveries, missed customers, refusals and returns.",
    filters: [],
  },
];

export function reportById(id: string): ReportDefinition | undefined {
  return REPORTS.find((report) => report.id === id);
}

export interface ReportFilters {
  category?: string;
  platform?: string;
  supplier?: string;
  channel?: string;
}

export interface ReportData {
  columns: string[];
  rows: (string | number)[][];
  numericColumns: number[];
  totalsRow?: (string | number)[];
  rowCount: number;
  truncated: boolean;
}

const MAX_REPORT_ROWS = 5000;

export async function buildReport(
  reportId: ReportId,
  storeId: string,
  currency: string,
  window: DateWindow,
  filters: ReportFilters,
): Promise<ReportData> {
  const money = (value: bigint) => formatMoney(value, currency, { showCode: false });

  switch (reportId) {
    case "revenue": {
      const rows = await prisma.sale.findMany({
        where: {
          storeId,
          deletedAt: null,
          date: { gte: window.from, lte: window.to },
          ...(filters.channel ? { channel: filters.channel } : {}),
        },
        orderBy: { date: "desc" },
        take: MAX_REPORT_ROWS + 1,
      });

      const visible = rows.slice(0, MAX_REPORT_ROWS);

      return {
        columns: [
          "Date",
          "Order",
          "Customer",
          "Product",
          "Channel",
          "Status",
          "Gross",
          "Discount",
          "Refund",
          "Shipping",
          "Net revenue",
        ],
        numericColumns: [6, 7, 8, 9, 10],
        rows: visible.map((row) => [
          formatDate(row.date),
          row.orderId,
          row.customerName ?? "",
          row.productName ?? "",
          row.channel,
          fulfillmentLabel(row.fulfillmentStatus),
          money(row.grossAmountMinor),
          money(row.discountMinor),
          money(row.refundMinor),
          money(row.shippingRevenueMinor),
          money(row.baseNetRevenueMinor),
        ]),
        totalsRow: [
          "Total",
          "",
          "",
          "",
          "",
          "",
          money(sum(visible, (r) => r.grossAmountMinor)),
          money(sum(visible, (r) => r.discountMinor)),
          money(sum(visible, (r) => r.refundMinor)),
          money(sum(visible, (r) => r.shippingRevenueMinor)),
          money(sum(visible, (r) => r.baseNetRevenueMinor)),
        ],
        rowCount: visible.length,
        truncated: rows.length > MAX_REPORT_ROWS,
      };
    }

    case "expenses": {
      const rows = await prisma.expense.findMany({
        where: {
          storeId,
          deletedAt: null,
          date: { gte: window.from, lte: window.to },
          ...(filters.category ? { categoryId: filters.category } : {}),
        },
        include: { category: { select: { name: true } } },
        orderBy: { date: "desc" },
        take: MAX_REPORT_ROWS + 1,
      });

      const visible = rows.slice(0, MAX_REPORT_ROWS);

      return {
        columns: ["Date", "Expense", "Category", "Vendor", "Paid by", "Currency", "Amount"],
        numericColumns: [6],
        rows: visible.map((row) => [
          formatDate(row.date),
          row.name,
          row.category?.name ?? "Uncategorised",
          row.vendorName ?? "",
          paymentMethodLabel(row.paymentMethod),
          row.currency,
          money(row.baseAmountMinor),
        ]),
        totalsRow: [
          "Total",
          "",
          "",
          "",
          "",
          "",
          money(sum(visible, (r) => r.baseAmountMinor)),
        ],
        rowCount: visible.length,
        truncated: rows.length > MAX_REPORT_ROWS,
      };
    }

    case "cogs": {
      const rows = await prisma.cogsEntry.findMany({
        where: {
          storeId,
          deletedAt: null,
          date: { gte: window.from, lte: window.to },
          ...(filters.supplier ? { supplierId: filters.supplier } : {}),
        },
        include: { supplier: { select: { name: true } } },
        orderBy: { date: "desc" },
        take: MAX_REPORT_ROWS + 1,
      });

      const visible = rows.slice(0, MAX_REPORT_ROWS);

      return {
        columns: ["Date", "Product", "SKU", "Supplier", "Reference", "Qty", "Unit cost", "Total cost"],
        numericColumns: [5, 6, 7],
        rows: visible.map((row) => [
          formatDate(row.date),
          row.productName,
          row.sku ?? "",
          row.supplier?.name ?? "",
          row.reference ?? "",
          row.quantity,
          toDecimalString(row.unitCostMinor),
          money(row.baseTotalCostMinor),
        ]),
        totalsRow: [
          "Total",
          "",
          "",
          "",
          "",
          visible.reduce((total, row) => total + row.quantity, 0),
          "",
          money(sum(visible, (r) => r.baseTotalCostMinor)),
        ],
        rowCount: visible.length,
        truncated: rows.length > MAX_REPORT_ROWS,
      };
    }

    case "advertising": {
      const rows = await prisma.adSpend.findMany({
        where: {
          storeId,
          deletedAt: null,
          date: { gte: window.from, lte: window.to },
          ...(filters.platform ? { platform: filters.platform } : {}),
        },
        orderBy: { date: "desc" },
        take: MAX_REPORT_ROWS + 1,
      });

      const visible = rows.slice(0, MAX_REPORT_ROWS);

      return {
        columns: [
          "Date",
          "Platform",
          "Campaign",
          "Campaign ID",
          "Impressions",
          "Clicks",
          "Conversions",
          "Spend",
        ],
        numericColumns: [4, 5, 6, 7],
        rows: visible.map((row) => [
          formatDate(row.date),
          adPlatformLabel(row.platform),
          row.campaignName ?? "",
          row.campaignId ?? "",
          row.impressions ?? "",
          row.clicks ?? "",
          row.conversions ?? "",
          money(row.baseAmountMinor),
        ]),
        totalsRow: [
          "Total",
          "",
          "",
          "",
          formatNumber(visible.reduce((total, row) => total + (row.impressions ?? 0), 0)),
          formatNumber(visible.reduce((total, row) => total + (row.clicks ?? 0), 0)),
          formatNumber(visible.reduce((total, row) => total + (row.conversions ?? 0), 0)),
          money(sum(visible, (r) => r.baseAmountMinor)),
        ],
        rowCount: visible.length,
        truncated: rows.length > MAX_REPORT_ROWS,
      };
    }

    case "product-profitability": {
      const dataset = await loadDataset(storeId, window);
      const rows = productProfitability(dataset);

      return {
        columns: ["Product", "SKU", "Units sold", "Revenue", "COGS", "Gross profit", "Margin"],
        numericColumns: [2, 3, 4, 5, 6],
        rows: rows.map((row) => [
          row.name,
          row.sku ?? "",
          row.unitsSold,
          money(row.revenue),
          money(row.cogs),
          money(row.grossProfit),
          formatPercent(row.marginPct),
        ]),
        totalsRow: [
          "Total",
          "",
          rows.reduce((total, row) => total + row.unitsSold, 0),
          money(sum(rows, (r) => r.revenue)),
          money(sum(rows, (r) => r.cogs)),
          money(sum(rows, (r) => r.grossProfit)),
          "",
        ],
        rowCount: rows.length,
        truncated: false,
      };
    }

    case "monthly-summary": {
      const dataset = await loadDataset(storeId, window);
      const buckets = monthBucketsFor(window);

      const monthly = buckets.map((bucket) => {
        const slice = filterDataset(dataset, bucket.start, bucket.end);
        return { label: formatMonth(bucket.start), summary: summarise(slice) };
      });

      const grand = summarise(dataset);

      return {
        columns: [
          "Month",
          "Orders",
          "Net revenue",
          "Cost of sales",
          "Gross profit",
          "Gross margin",
          "Ad spend",
          "Operating expenses",
          "Net profit",
          "Net margin",
        ],
        numericColumns: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        rows: monthly.map(({ label, summary }) => [
          label,
          summary.orders,
          money(summary.netRevenue),
          money(summary.directCosts),
          money(summary.grossProfit),
          formatPercent(summary.grossMarginPct),
          money(summary.adSpend),
          money(summary.operatingExpenses),
          money(summary.netProfit),
          formatPercent(summary.netProfitMarginPct),
        ]),
        totalsRow: [
          "Total",
          grand.orders,
          money(grand.netRevenue),
          money(grand.directCosts),
          money(grand.grossProfit),
          formatPercent(grand.grossMarginPct),
          money(grand.adSpend),
          money(grand.operatingExpenses),
          money(grand.netProfit),
          formatPercent(grand.netProfitMarginPct),
        ],
        rowCount: monthly.length,
        truncated: false,
      };
    }

    case "delivery-performance": {
      const performance = await deliveryPerformance(storeId, window);

      const rows: (string | number)[][] = [
        ["Total shipments", performance.shipments],
        ["Delivered", performance.delivered],
        ["Failed", performance.failed],
        ["Returned or refused", performance.returned],
        ["Still in flight", performance.inFlight],
        [
          "Delivery success rate",
          performance.successRatePct === null ? "—" : `${performance.successRatePct.toFixed(1)}%`,
        ],
        [
          "Average delivery time",
          performance.averageDeliveryHours === null
            ? "—"
            : formatHours(performance.averageDeliveryHours),
        ],
        [
          "Average attempts per shipment",
          performance.averageAttempts === null ? "—" : performance.averageAttempts.toFixed(2),
        ],
      ];

      return {
        columns: ["Measure", "Value"],
        numericColumns: [1],
        rows,
        rowCount: rows.length,
        truncated: false,
      };
    }

    case "courier-performance": {
      const couriers = await prisma.courier.findMany({
        where: { storeId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

      const rows: (string | number)[][] = [];

      for (const courier of couriers) {
        const performance = await deliveryPerformance(storeId, window, courier.id);
        if (performance.shipments === 0) continue;

        const share = (value: number) =>
          performance.shipments === 0
            ? "—"
            : `${((value / performance.shipments) * 100).toFixed(1)}%`;

        rows.push([
          courier.name,
          performance.shipments,
          performance.delivered,
          share(performance.delivered),
          performance.failed,
          share(performance.failed),
          performance.returned,
          share(performance.returned),
          performance.averageDeliveryHours === null
            ? "—"
            : formatHours(performance.averageDeliveryHours),
          performance.averageAttempts === null ? "—" : performance.averageAttempts.toFixed(2),
        ]);
      }

      return {
        columns: [
          "Courier",
          "Shipments",
          "Delivered",
          "Delivered %",
          "Failed",
          "Failed %",
          "Returned",
          "Returned %",
          "Avg delivery time",
          "Avg attempts",
        ],
        numericColumns: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        rows,
        rowCount: rows.length,
        truncated: false,
      };
    }

    case "problem-orders": {
      const orders = await prisma.order.findMany({
        where: {
          storeId,
          deletedAt: null,
          placedAt: { gte: window.from, lte: window.to },
          OR: [{ hasIssue: true }, { status: { in: ISSUE_STATUSES } }],
        },
        include: {
          shipments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { trackingNumber: true, courierStatus: true },
          },
        },
        orderBy: [{ deliveryAttempts: "desc" }, { placedAt: "desc" }],
        take: MAX_REPORT_ROWS + 1,
      });

      const visible = orders.slice(0, MAX_REPORT_ROWS);

      return {
        columns: [
          "Order",
          "Date",
          "Customer",
          "Phone",
          "City",
          "CN",
          "Issue",
          "Courier status",
          "Attempts",
          "Order value",
        ],
        numericColumns: [8, 9],
        rows: visible.map((order) => [
          order.orderNumber,
          formatDate(order.placedAt),
          order.customerName ?? "",
          order.customerPhone ?? "",
          order.city ?? "",
          order.shipments[0]?.trackingNumber ?? "",
          statusLabel(order.status),
          order.shipments[0]?.courierStatus ?? "",
          order.deliveryAttempts,
          money(order.totalMinor),
        ]),
        totalsRow: [
          "Total",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          visible.reduce((total, order) => total + order.deliveryAttempts, 0),
          money(sum(visible, (order) => order.totalMinor)),
        ],
        rowCount: visible.length,
        truncated: orders.length > MAX_REPORT_ROWS,
      };
    }

    default:
      return { columns: [], rows: [], numericColumns: [], rowCount: 0, truncated: false };
  }
}

function formatHours(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}

function sum<T>(rows: T[], pick: (row: T) => bigint): bigint {
  return rows.reduce((total, row) => total + pick(row), 0n);
}

/** Headline figures shown above the report cards. */
export async function reportOverview(storeId: string, window: DateWindow) {
  const [dataset, orderCount] = await Promise.all([
    loadDataset(storeId, window),
    prisma.sale.count({
      where: { storeId, ...recognisedSaleWhere, date: { gte: window.from, lte: window.to } },
    }),
  ]);

  return { summary: summarise(dataset), orderCount };
}
