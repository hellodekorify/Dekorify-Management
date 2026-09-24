import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { amountFilter, makeLinkBuilders, parseListParams } from "@/lib/list-params";
import { formatMoney, formatPercent } from "@/lib/currency";
import { formatDate, toInputDate } from "@/lib/dates";
import { fxRateToNumber, percentOf, toDecimalString } from "@/lib/money";
import { loadDataset, summarise, breakdownCogsByProduct } from "@/lib/finance";
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
import { HorizontalBarChart } from "@/components/charts/chart-kit";
import { AddCogsButton, CogsRow, type CogsRowData, type ProductOption } from "./cogs-client";

export const metadata: Metadata = { title: "COGS" };

const SORT_COLUMNS: Record<string, string> = {
  date: "date",
  product: "productName",
  quantity: "quantity",
  amount: "baseTotalCostMinor",
};

export default async function CogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { store } = await requireContext();
  const raw = await searchParams;
  const params = parseListParams(raw, { defaultSort: "date", defaultDir: "desc" });
  const links = makeLinkBuilders("/cogs", raw);

  const where: Prisma.CogsEntryWhereInput = {
    storeId: store.id,
    deletedAt: null,
    date: { gte: params.range.from, lte: params.range.to },
    ...(params.search
      ? {
          OR: [
            { productName: { contains: params.search } },
            { sku: { contains: params.search } },
            { reference: { contains: params.search } },
            { notes: { contains: params.search } },
          ],
        }
      : {}),
    ...(raw.supplier ? { supplierId: raw.supplier } : {}),
    ...(amountFilter(params) ? { baseTotalCostMinor: amountFilter(params) } : {}),
  };

  const orderBy = {
    [SORT_COLUMNS[params.sort] ?? "date"]: params.dir,
  } as Prisma.CogsEntryOrderByWithRelationInput;

  const [rows, total, aggregate, products, suppliers, dataset] = await Promise.all([
    prisma.cogsEntry.findMany({
      where,
      include: { supplier: { select: { name: true } } },
      orderBy: [orderBy, { createdAt: "desc" }],
      skip: params.skip,
      take: params.pageSize,
    }),
    prisma.cogsEntry.count({ where }),
    prisma.cogsEntry.aggregate({
      where,
      _sum: { baseTotalCostMinor: true, quantity: true },
    }),
    prisma.product.findMany({
      where: { storeId: store.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, unitCostMinor: true, supplierId: true },
    }),
    prisma.supplier.findMany({
      where: { storeId: store.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    loadDataset(store.id, params.range),
  ]);

  const summary = summarise(dataset);
  const byProduct = breakdownCogsByProduct(dataset).slice(0, 10);

  const currency = store.baseCurrency;
  const periodTotal = aggregate._sum.baseTotalCostMinor ?? 0n;
  const unitsTotal = aggregate._sum.quantity ?? 0;
  const pageTotal = rows.reduce((sum, row) => sum + row.baseTotalCostMinor, 0n);

  const entries: CogsRowData[] = rows.map((row) => ({
    id: row.id,
    date: formatDate(row.date),
    dateInput: toInputDate(row.date),
    productId: row.productId,
    productName: row.productName,
    sku: row.sku,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    quantity: row.quantity,
    unitCostInput: toDecimalString(row.unitCostMinor),
    unitCostFormatted: formatMoney(row.unitCostMinor, row.currency, { decimals: true }),
    totalFormatted: formatMoney(row.totalCostMinor, row.currency),
    currency: row.currency,
    fxRateInput: String(fxRateToNumber(row.fxRateE8)),
    isForeign: row.currency !== currency,
    baseTotalFormatted: formatMoney(row.baseTotalCostMinor, currency),
    reference: row.reference,
    notes: row.notes,
  }));

  const productOptions: ProductOption[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    unitCostInput: toDecimalString(product.unitCostMinor),
    supplierId: product.supplierId,
  }));

  return (
    <>
      <PageHeader
        title="Cost of goods sold"
        description="What your stock cost. This is the single biggest lever on gross profit, so it pays to keep it accurate."
        actions={
          <AddCogsButton
            products={productOptions}
            suppliers={suppliers}
            baseCurrency={currency}
          />
        }
        filters={
          <FilterBar>
            <SearchInput placeholder="Search product, SKU or reference…" />
            <FilterSelect
              param="supplier"
              label="Supplier"
              allLabel="All suppliers"
              options={suppliers.map((supplier) => ({
                value: supplier.id,
                label: supplier.name,
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
            label={`Total COGS · ${params.range.label.toLowerCase()}`}
            value={formatMoney(periodTotal, currency)}
            sub={`${total.toLocaleString()} entr${total === 1 ? "y" : "ies"}`}
          />
          <SummaryTile
            label="Units purchased"
            value={unitsTotal.toLocaleString()}
            sub={
              unitsTotal > 0
                ? `${formatMoney(periodTotal / BigInt(unitsTotal), currency)} average unit cost`
                : "Nothing recorded yet"
            }
          />
          <SummaryTile
            label="COGS as % of revenue"
            value={formatPercent(summary.cogsPctOfRevenue)}
            sub={`Against ${formatMoney(summary.netRevenue, currency)} net revenue`}
          />
          <SummaryTile
            label="Gross profit"
            value={formatMoney(summary.grossProfit, currency)}
            tone={summary.grossProfit >= 0n ? "positive" : "negative"}
            sub={`${formatPercent(summary.grossMarginPct)} margin`}
          />
        </div>

        {byProduct.length > 0 && (
          <Card>
            <CardHeader
              title="Where the cost sits"
              description="Top products by cost of goods in this period"
            />
            <CardBody>
              <HorizontalBarChart
                data={byProduct.map((row) => ({
                  label: row.label.length > 26 ? `${row.label.slice(0, 25)}…` : row.label,
                  amountMajor: row.amountMajor,
                }))}
                currency={currency}
                height={Math.max(200, byProduct.length * 32)}
                color="#f59e0b"
              />
            </CardBody>
          </Card>
        )}

        <Card className="overflow-hidden">
          <TableWrap>
            <THead>
              <TH sortKey="date" currentSort={params.sort} currentDir={params.dir} sortHref={links.sortHref}>
                Date
              </TH>
              <TH
                sortKey="product"
                currentSort={params.sort}
                currentDir={params.dir}
                sortHref={links.sortHref}
              >
                Product
              </TH>
              <TH>SKU</TH>
              <TH>Supplier</TH>
              <TH
                align="right"
                sortKey="quantity"
                currentSort={params.sort}
                currentDir={params.dir}
                sortHref={links.sortHref}
              >
                Qty
              </TH>
              <TH align="right">Unit cost</TH>
              <TH
                align="right"
                sortKey="amount"
                currentSort={params.sort}
                currentDir={params.dir}
                sortHref={links.sortHref}
              >
                Total cost
              </TH>
              <TH width="52px" />
            </THead>

            <tbody>
              {entries.length === 0 ? (
                <TableEmpty
                  colSpan={8}
                  title="No COGS entries match these filters"
                  description="Without COGS, gross profit is just revenue — record what your stock cost to see the real picture."
                  action={
                    <AddCogsButton
                      products={productOptions}
                      suppliers={suppliers}
                      baseCurrency={currency}
                    />
                  }
                />
              ) : (
                entries.map((entry) => (
                  <CogsRow
                    key={entry.id}
                    entry={entry}
                    products={productOptions}
                    suppliers={suppliers}
                    baseCurrency={currency}
                  />
                ))
              )}
            </tbody>

            {entries.length > 0 && (
              <TFootRow>
                <TD colSpan={6} className="text-[13px] text-muted-strong">
                  Total on this page
                </TD>
                <TD numeric align="right">
                  {formatMoney(pageTotal, currency)}
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
