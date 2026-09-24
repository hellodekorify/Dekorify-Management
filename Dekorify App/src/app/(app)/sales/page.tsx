import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { amountFilter, makeLinkBuilders, parseListParams } from "@/lib/list-params";
import { formatMoney, formatPercent } from "@/lib/currency";
import { formatDate, toInputDate } from "@/lib/dates";
import { fxRateToNumber, percentOf, toDecimalString } from "@/lib/money";
import {
  breakdownRevenueByChannel,
  buildTimeSeries,
  loadDataset,
  summarise,
  EXCLUDED_FROM_REVENUE,
} from "@/lib/finance";
import { FULFILLMENT_STATUSES, SALES_CHANNELS, fulfillmentLabel } from "@/lib/constants";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import {
  AmountFilter,
  ClearFiltersButton,
  FilterBar,
  FilterSelect,
  SearchInput,
} from "@/components/filters/table-filters";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SummaryTile } from "@/components/ui/summary-tile";
import { Pagination } from "@/components/ui/pagination";
import { TableEmpty, TableWrap, TD, TFootRow, TH, THead } from "@/components/ui/table";
import { TrendChart, DonutChart } from "@/components/charts/chart-kit";
import {
  AddSaleButton,
  SaleRow,
  type SaleProductOption,
  type SaleRowData,
} from "./sales-client";

export const metadata: Metadata = { title: "Sales" };

const SORT_COLUMNS: Record<string, string> = {
  date: "date",
  order: "orderId",
  gross: "grossAmountMinor",
  amount: "baseNetRevenueMinor",
};

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { store } = await requireContext();
  const raw = await searchParams;
  const params = parseListParams(raw, { defaultSort: "date", defaultDir: "desc" });
  const links = makeLinkBuilders("/sales", raw);

  const where: Prisma.SaleWhereInput = {
    storeId: store.id,
    deletedAt: null,
    date: { gte: params.range.from, lte: params.range.to },
    ...(params.search
      ? {
          OR: [
            { orderId: { contains: params.search } },
            { customerName: { contains: params.search } },
            { productName: { contains: params.search } },
            { sku: { contains: params.search } },
            { notes: { contains: params.search } },
          ],
        }
      : {}),
    ...(raw.channel ? { channel: raw.channel } : {}),
    ...(raw.status ? { fulfillmentStatus: raw.status } : {}),
    ...(amountFilter(params) ? { baseNetRevenueMinor: amountFilter(params) } : {}),
  };

  const orderBy = {
    [SORT_COLUMNS[params.sort] ?? "date"]: params.dir,
  } as Prisma.SaleOrderByWithRelationInput;

  const [rows, total, aggregate, products, dataset, statusCounts] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: [orderBy, { createdAt: "desc" }],
      skip: params.skip,
      take: params.pageSize,
    }),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({
      where,
      _sum: {
        grossAmountMinor: true,
        discountMinor: true,
        refundMinor: true,
        shippingRevenueMinor: true,
        paymentFeeMinor: true,
        baseNetRevenueMinor: true,
      },
    }),
    prisma.product.findMany({
      where: { storeId: store.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, sellingPriceMinor: true },
    }),
    loadDataset(store.id, params.range),
    prisma.sale.groupBy({
      by: ["fulfillmentStatus"],
      where: {
        storeId: store.id,
        deletedAt: null,
        date: { gte: params.range.from, lte: params.range.to },
      },
      _count: { _all: true },
    }),
  ]);

  const summary = summarise(dataset);
  const { points } = buildTimeSeries(dataset);
  const byChannel = breakdownRevenueByChannel(dataset);

  const currency = store.baseCurrency;
  const pageNet = rows.reduce((sum, row) => sum + row.baseNetRevenueMinor, 0n);
  const pageGross = rows.reduce((sum, row) => sum + row.grossAmountMinor, 0n);
  const pageDiscount = rows.reduce((sum, row) => sum + row.discountMinor, 0n);

  const returnedCount =
    statusCounts.find((row) => row.fulfillmentStatus === "RETURNED")?._count._all ?? 0;
  const cancelledCount =
    statusCounts.find((row) => row.fulfillmentStatus === "CANCELLED")?._count._all ?? 0;
  const allCount = statusCounts.reduce((sum, row) => sum + row._count._all, 0);

  const sales: SaleRowData[] = rows.map((row) => ({
    id: row.id,
    date: formatDate(row.date),
    dateInput: toInputDate(row.date),
    orderId: row.orderId,
    customerName: row.customerName,
    channel: row.channel,
    productId: row.productId,
    productName: row.productName,
    sku: row.sku,
    quantity: row.quantity,
    grossInput: toDecimalString(row.grossAmountMinor),
    discountInput: toDecimalString(row.discountMinor),
    refundInput: toDecimalString(row.refundMinor),
    shippingInput: toDecimalString(row.shippingRevenueMinor),
    paymentFeeInput: toDecimalString(row.paymentFeeMinor),
    grossFormatted: formatMoney(row.grossAmountMinor, row.currency),
    discountFormatted:
      row.discountMinor === 0n ? "—" : formatMoney(row.discountMinor, row.currency),
    refundFormatted: formatMoney(row.refundMinor, row.currency),
    shippingFormatted: formatMoney(row.shippingRevenueMinor, row.currency),
    paymentFeeFormatted: formatMoney(row.paymentFeeMinor, row.currency),
    netFormatted: formatMoney(row.netRevenueMinor, row.currency),
    currency: row.currency,
    fxRateInput: String(fxRateToNumber(row.fxRateE8)),
    isForeign: row.currency !== currency,
    baseNetFormatted: formatMoney(row.baseNetRevenueMinor, currency),
    financialStatus: row.financialStatus,
    fulfillmentStatus: row.fulfillmentStatus,
    fulfillmentLabel: fulfillmentLabel(row.fulfillmentStatus),
    countsAsRevenue:
      !row.isCancelled &&
      !(row.fulfillmentStatus && EXCLUDED_FROM_REVENUE.includes(row.fulfillmentStatus)),
    notes: row.notes,
  }));

  const productOptions: SaleProductOption[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    priceInput: toDecimalString(product.sellingPriceMinor),
  }));

  return (
    <>
      <PageHeader
        title="Sales"
        description="Every order and what it actually earned after discounts and refunds. Cancelled and returned orders are kept for the record but earn nothing."
        actions={<AddSaleButton products={productOptions} baseCurrency={currency} />}
        filters={
          <FilterBar>
            <SearchInput placeholder="Search order, customer or product…" />
            <FilterSelect
              param="channel"
              label="Channel"
              allLabel="All channels"
              options={SALES_CHANNELS.map((channel) => ({ value: channel, label: channel }))}
            />
            <FilterSelect
              param="status"
              label="Status"
              allLabel="All statuses"
              options={FULFILLMENT_STATUSES.map((status) => ({
                value: status.value,
                label: status.label,
              }))}
            />
            <AmountFilter />
            <DateRangeFilter label={params.range.label} />
            <ClearFiltersButton />
          </FilterBar>
        }
      />

      <PageBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            label={`Net revenue · ${params.range.label.toLowerCase()}`}
            value={formatMoney(summary.netRevenue, currency)}
            sub={`${summary.orders.toLocaleString()} revenue-earning order${summary.orders === 1 ? "" : "s"}`}
          />
          <SummaryTile
            label="Average order value"
            value={formatMoney(summary.averageOrderValue, currency)}
            sub={`${summary.units.toLocaleString()} units sold`}
          />
          <SummaryTile
            label="Discounts given"
            value={formatMoney(aggregate._sum.discountMinor ?? 0n, currency)}
            sub={`${formatPercent(percentOf(summary.discounts, summary.grossRevenue))} of gross sales`}
          />
          <SummaryTile
            label="Returned & cancelled"
            value={(returnedCount + cancelledCount).toLocaleString()}
            tone={returnedCount + cancelledCount > 0 ? "negative" : undefined}
            sub={
              allCount === 0
                ? "No orders in this period"
                : `${formatPercent((((returnedCount + cancelledCount) / allCount) * 100))} of ${allCount.toLocaleString()} orders`
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Revenue over time" description="Net of discounts and refunds" />
            <CardBody>
              <TrendChart
                data={points}
                currency={currency}
                showLegend={false}
                series={[
                  { dataKey: "revenue", name: "Net revenue", color: "#4f46e5", type: "area" },
                ]}
                height={260}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Revenue by channel" />
            <CardBody>
              {byChannel.length === 0 ? (
                <p className="py-14 text-center text-[13px] text-muted">
                  No sales in this period.
                </p>
              ) : (
                <>
                  <DonutChart data={byChannel} currency={currency} height={180} />
                  <ul className="mt-4 space-y-2">
                    {byChannel.map((row, index) => (
                      <li key={row.key} className="flex items-center gap-2.5 text-[13px]">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{
                            backgroundColor: ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6"][
                              index % 6
                            ],
                          }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-muted-strong">
                          {row.label}
                        </span>
                        <span className="tabular shrink-0 font-medium">
                          {formatMoney(row.amount, currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <TableWrap>
            <THead>
              <TH sortKey="date" currentSort={params.sort} currentDir={params.dir} sortHref={links.sortHref}>
                Date
              </TH>
              <TH sortKey="order" currentSort={params.sort} currentDir={params.dir} sortHref={links.sortHref}>
                Order
              </TH>
              <TH>Product</TH>
              <TH>Channel</TH>
              <TH>Status</TH>
              <TH
                align="right"
                sortKey="gross"
                currentSort={params.sort}
                currentDir={params.dir}
                sortHref={links.sortHref}
              >
                Gross
              </TH>
              <TH align="right">Discount</TH>
              <TH
                align="right"
                sortKey="amount"
                currentSort={params.sort}
                currentDir={params.dir}
                sortHref={links.sortHref}
              >
                Net revenue
              </TH>
              <TH width="52px" />
            </THead>

            <tbody>
              {sales.length === 0 ? (
                <TableEmpty
                  colSpan={9}
                  title="No sales match these filters"
                  description="Record orders one at a time, or import a Shopify export from the Import Data page."
                  action={<AddSaleButton products={productOptions} baseCurrency={currency} />}
                />
              ) : (
                sales.map((sale) => (
                  <SaleRow
                    key={sale.id}
                    sale={sale}
                    products={productOptions}
                    baseCurrency={currency}
                  />
                ))
              )}
            </tbody>

            {sales.length > 0 && (
              <TFootRow>
                <TD colSpan={5} className="text-[13px] text-muted-strong">
                  Total on this page
                </TD>
                <TD numeric align="right">
                  {formatMoney(pageGross, currency)}
                </TD>
                <TD numeric align="right">
                  {pageDiscount === 0n ? "—" : formatMoney(pageDiscount, currency)}
                </TD>
                <TD numeric align="right">
                  {formatMoney(pageNet, currency)}
                </TD>
                <TD />
              </TFootRow>
            )}
          </TableWrap>

          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={total}
            hrefFor={links.pageHref}
          />
        </Card>
      </PageBody>
    </>
  );
}
