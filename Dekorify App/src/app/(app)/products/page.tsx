import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { makeLinkBuilders, parseListParams } from "@/lib/list-params";
import { formatMoney, formatPercent } from "@/lib/currency";
import { percentOf, sumMoney, toDecimalString } from "@/lib/money";
import { loadDataset, productProfitability } from "@/lib/finance";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { ClearFiltersButton, FilterBar, FilterSelect, SearchInput } from "@/components/filters/table-filters";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SummaryTile } from "@/components/ui/summary-tile";
import { Pagination } from "@/components/ui/pagination";
import { TableEmpty, TableWrap, TH, THead } from "@/components/ui/table";
import { ExportMenu, type ExportPayload } from "@/components/export-menu";
import {
  AddProductButton,
  ProductRow,
  SyncProductsButton,
  type ProductRowData,
} from "./products-client";

export const metadata: Metadata = { title: "Products" };

const SORT_COLUMNS: Record<string, string> = {
  name: "name",
  sku: "sku",
  price: "sellingPriceMinor",
  cost: "unitCostMinor",
  stock: "quantityOnHand",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { store } = await requireContext();
  const raw = await searchParams;
  const params = parseListParams(raw, {
    defaultSort: "name",
    defaultDir: "asc",
    defaultRange: "this_year",
  });
  const links = makeLinkBuilders("/products", raw);

  const where: Prisma.ProductWhereInput = {
    storeId: store.id,
    deletedAt: null,
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search } },
            { sku: { contains: params.search } },
            { category: { contains: params.search } },
            { notes: { contains: params.search } },
          ],
        }
      : {}),
    ...(raw.supplier ? { supplierId: raw.supplier } : {}),
    ...(raw.category ? { category: raw.category } : {}),
  };

  const orderBy = {
    [SORT_COLUMNS[params.sort] ?? "name"]: params.dir,
  } as Prisma.ProductOrderByWithRelationInput;

  const [rows, total, allProducts, suppliers, dataset, storeRecord] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { supplier: { select: { name: true } } },
      orderBy,
      skip: params.skip,
      take: params.pageSize,
    }),
    prisma.product.count({ where }),
    prisma.product.findMany({
      where: { storeId: store.id, deletedAt: null },
      select: { category: true, sellingPriceMinor: true, unitCostMinor: true, quantityOnHand: true },
    }),
    prisma.supplier.findMany({
      where: { storeId: store.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    loadDataset(store.id, params.range),
    prisma.store.findUnique({
      where: { id: store.id },
      select: { shopifyDomain: true, shopifyAccessToken: true, shopifyLastSyncAt: true },
    }),
  ]);

  const shopifyConnected = Boolean(
    storeRecord?.shopifyDomain && storeRecord.shopifyAccessToken,
  );

  const performance = productProfitability(dataset);
  const performanceByName = new Map(
    performance.map((row) => [row.name.trim().toLowerCase(), row]),
  );

  const currency = store.baseCurrency;

  const categories = [
    ...new Set(allProducts.map((product) => product.category).filter((c): c is string => Boolean(c))),
  ].sort();

  const stockValue = sumMoney(
    allProducts.map((product) => product.unitCostMinor * BigInt(Math.max(0, product.quantityOnHand))),
  );
  const retailValue = sumMoney(
    allProducts.map(
      (product) => product.sellingPriceMinor * BigInt(Math.max(0, product.quantityOnHand)),
    ),
  );

  const withCost = allProducts.filter(
    (product) => product.unitCostMinor > 0n && product.sellingPriceMinor > 0n,
  );
  const averageMargin =
    withCost.length === 0
      ? null
      : percentOf(
          sumMoney(withCost.map((p) => p.sellingPriceMinor - p.unitCostMinor)),
          sumMoney(withCost.map((p) => p.sellingPriceMinor)),
        );

  const missingCost = allProducts.filter((product) => product.unitCostMinor === 0n).length;

  const products: ProductRowData[] = rows.map((product) => {
    const profit = product.sellingPriceMinor - product.unitCostMinor;
    const margin =
      product.sellingPriceMinor === 0n ? null : percentOf(profit, product.sellingPriceMinor);
    const sold = performanceByName.get(product.name.trim().toLowerCase());

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      sellingPriceInput: toDecimalString(product.sellingPriceMinor),
      sellingPriceFormatted: formatMoney(product.sellingPriceMinor, currency),
      unitCostInput: toDecimalString(product.unitCostMinor),
      unitCostFormatted:
        product.unitCostMinor === 0n ? "not set" : formatMoney(product.unitCostMinor, currency),
      profitPerUnitFormatted:
        product.unitCostMinor === 0n ? "—" : formatMoney(profit, currency),
      marginPct: product.unitCostMinor === 0n ? null : margin,
      marginLabel: product.unitCostMinor === 0n ? "no cost" : formatPercent(margin),
      quantityOnHand: product.quantityOnHand,
      reorderLevel: product.reorderLevel,
      lowStock:
        product.reorderLevel !== null && product.quantityOnHand <= product.reorderLevel,
      supplierId: product.supplierId,
      supplierName: product.supplier?.name ?? null,
      notes: product.notes,
      unitsSold: sold?.unitsSold ?? 0,
      revenueFormatted: formatMoney(sold?.revenue ?? 0n, currency),
    };
  });

  const topPerformers = performance.filter((row) => row.unitsSold > 0).slice(0, 10);

  const exportPayload: ExportPayload = {
    title: `Product profitability — ${store.name}`,
    subtitle: params.range.label,
    columns: [
      "Product",
      "SKU",
      "Units sold",
      `Revenue (${currency})`,
      `COGS (${currency})`,
      `Gross profit (${currency})`,
      "Margin",
    ],
    numericColumns: [2, 3, 4, 5, 6],
    rows: performance.map((row) => [
      row.name,
      row.sku ?? "",
      row.unitsSold,
      formatMoney(row.revenue, currency, { showCode: false }),
      formatMoney(row.cogs, currency, { showCode: false }),
      formatMoney(row.grossProfit, currency, { showCode: false }),
      formatPercent(row.marginPct),
    ]),
  };

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalogue, with the profit each unit actually makes once its cost is taken off."
        actions={
          <>
            <DateRangeFilter label={params.range.label} />
            <SyncProductsButton connected={shopifyConnected} />
            <ExportMenu payload={exportPayload} />
            <AddProductButton
              suppliers={suppliers}
              categories={categories}
              baseCurrency={currency}
            />
          </>
        }
        filters={
          <FilterBar>
            <SearchInput placeholder="Search name, SKU or category…" />
            <FilterSelect
              param="category"
              label="Category"
              allLabel="All categories"
              options={categories.map((category) => ({ value: category, label: category }))}
            />
            <FilterSelect
              param="supplier"
              label="Supplier"
              allLabel="All suppliers"
              options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
            />
            <ClearFiltersButton />
          </FilterBar>
        }
      />

      <PageBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            label="Products"
            value={allProducts.length.toLocaleString()}
            sub={missingCost > 0 ? `${missingCost} without a unit cost` : "All have a unit cost"}
          />
          <SummaryTile
            label="Stock at cost"
            value={formatMoney(stockValue, currency)}
            sub="What your inventory cost you"
          />
          <SummaryTile
            label="Stock at retail"
            value={formatMoney(retailValue, currency)}
            sub={`${formatMoney(retailValue - stockValue, currency)} of profit if it all sells`}
          />
          <SummaryTile
            label="Average margin"
            value={formatPercent(averageMargin)}
            tone={averageMargin !== null && averageMargin >= 40 ? "positive" : undefined}
            sub="Across products with a cost recorded"
          />
        </div>

        {missingCost > 0 && (
          <div className="rounded-xl border border-warning-border bg-warning-soft p-4">
            <p className="text-[13.5px] font-semibold text-warning">
              {missingCost} product{missingCost === 1 ? " has" : "s have"} no unit cost
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-warning">
              Without a cost, those products look infinitely profitable and your gross margin is
              overstated. Add their costs to make the numbers real.
            </p>
          </div>
        )}

        <Card className="overflow-hidden">
          <TableWrap>
            <THead>
              <TH sortKey="name" currentSort={params.sort} currentDir={params.dir} sortHref={links.sortHref}>
                Product
              </TH>
              <TH sortKey="sku" currentSort={params.sort} currentDir={params.dir} sortHref={links.sortHref}>
                SKU
              </TH>
              <TH>Supplier</TH>
              <TH align="right" sortKey="price" currentSort={params.sort} currentDir={params.dir} sortHref={links.sortHref}>
                Price
              </TH>
              <TH align="right" sortKey="cost" currentSort={params.sort} currentDir={params.dir} sortHref={links.sortHref}>
                Unit cost
              </TH>
              <TH align="right">Profit/unit</TH>
              <TH align="right">Margin</TH>
              <TH align="right" sortKey="stock" currentSort={params.sort} currentDir={params.dir} sortHref={links.sortHref}>
                Stock
              </TH>
              <TH align="right">Sold</TH>
              <TH width="52px" />
            </THead>
            <tbody>
              {products.length === 0 ? (
                <TableEmpty
                  colSpan={10}
                  title="No products match these filters"
                  description="Add your catalogue here so sales and COGS entries can be linked to real products with real costs."
                  action={
                    <AddProductButton
                      suppliers={suppliers}
                      categories={categories}
                      baseCurrency={currency}
                    />
                  }
                />
              ) : (
                products.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    suppliers={suppliers}
                    categories={categories}
                    baseCurrency={currency}
                  />
                ))
              )}
            </tbody>
          </TableWrap>

          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={total}
            hrefFor={links.pageHref}
          />
        </Card>

        {topPerformers.length > 0 && (
          <Card className="overflow-hidden">
            <CardHeader
              title="Product profitability"
              description={`Actual revenue and cost recorded during ${params.range.label.toLowerCase()}, ranked by gross profit`}
            />
            <CardBody className="p-0 sm:p-0">
              <TableWrap>
                <THead>
                  <TH>Product</TH>
                  <TH align="right">Units sold</TH>
                  <TH align="right">Revenue</TH>
                  <TH align="right">COGS</TH>
                  <TH align="right">Gross profit</TH>
                  <TH align="right">Margin</TH>
                </THead>
                <tbody>
                  {topPerformers.map((row) => (
                    <tr
                      key={row.name}
                      className="border-b border-border-subtle last:border-0 hover:bg-surface-muted/60"
                    >
                      <td className="px-3.5 py-2.5">
                        <span className="font-medium">{row.name}</span>
                        {row.sku && (
                          <span className="ml-2 font-mono text-[11.5px] text-muted">{row.sku}</span>
                        )}
                      </td>
                      <td className="tabular px-3.5 py-2.5 text-right text-muted-strong">
                        {row.unitsSold.toLocaleString()}
                      </td>
                      <td className="tabular px-3.5 py-2.5 text-right text-muted-strong">
                        {formatMoney(row.revenue, currency)}
                      </td>
                      <td className="tabular px-3.5 py-2.5 text-right text-muted-strong">
                        {row.cogs === 0n ? (
                          <span className="text-warning">not recorded</span>
                        ) : (
                          formatMoney(row.cogs, currency)
                        )}
                      </td>
                      <td
                        className={
                          row.grossProfit >= 0n
                            ? "tabular px-3.5 py-2.5 text-right font-medium text-positive"
                            : "tabular px-3.5 py-2.5 text-right font-medium text-negative"
                        }
                      >
                        {formatMoney(row.grossProfit, currency)}
                      </td>
                      <td className="tabular px-3.5 py-2.5 text-right text-muted-strong">
                        {formatPercent(row.marginPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </CardBody>
          </Card>
        )}
      </PageBody>
    </>
  );
}
