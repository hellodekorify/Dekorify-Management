import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { buildReport, reportById, type ReportId } from "@/lib/reports";
import { resolveDateRange, type DatePreset } from "@/lib/dates";
import { AD_PLATFORMS, SALES_CHANNELS } from "@/lib/constants";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { ClearFiltersButton, FilterBar, FilterSelect } from "@/components/filters/table-filters";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { ExportMenu } from "@/components/export-menu";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ report: string }>;
}): Promise<Metadata> {
  const { report } = await params;
  return { title: reportById(report)?.title ?? "Report" };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { report: reportSlug } = await params;
  const definition = reportById(reportSlug);
  if (!definition || definition.href) notFound();

  const { store } = await requireContext();
  const query = await searchParams;

  const range = resolveDateRange(
    (query.range as DatePreset) ?? "this_month",
    query.from,
    query.to,
  );

  const [data, categories, suppliers] = await Promise.all([
    buildReport(definition.id as ReportId, store.id, store.baseCurrency, range, {
      category: query.category,
      platform: query.platform,
      supplier: query.supplier,
      channel: query.channel,
    }),
    definition.filters.includes("category")
      ? prisma.expenseCategory.findMany({
          where: { storeId: store.id, deletedAt: null },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    definition.filters.includes("supplier")
      ? prisma.supplier.findMany({
          where: { storeId: store.id, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const carriedQuery = new URLSearchParams();
  for (const key of ["range", "from", "to"]) {
    if (query[key]) carriedQuery.set(key, query[key]!);
  }
  const backHref = `/reports${carriedQuery.toString() ? `?${carriedQuery}` : ""}`;

  const exportRows = data.totalsRow ? [...data.rows, data.totalsRow] : data.rows;

  return (
    <>
      <PageHeader
        title={definition.title}
        description={`${definition.description} · ${range.label} · figures in ${store.baseCurrency}`}
        actions={
          <>
            <LinkButton href={backHref} className="gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All reports
            </LinkButton>
            <DateRangeFilter label={range.label} />
            <ExportMenu
              payload={{
                title: `${definition.title} — ${store.name}`,
                subtitle: range.label,
                columns: data.columns,
                rows: exportRows,
                numericColumns: data.numericColumns,
              }}
            />
          </>
        }
        filters={
          definition.filters.length > 0 ? (
            <FilterBar>
              {definition.filters.includes("category") && (
                <FilterSelect
                  param="category"
                  label="Category"
                  allLabel="All categories"
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                />
              )}
              {definition.filters.includes("supplier") && (
                <FilterSelect
                  param="supplier"
                  label="Supplier"
                  allLabel="All suppliers"
                  options={suppliers.map((supplier) => ({
                    value: supplier.id,
                    label: supplier.name,
                  }))}
                />
              )}
              {definition.filters.includes("platform") && (
                <FilterSelect
                  param="platform"
                  label="Platform"
                  allLabel="All platforms"
                  options={AD_PLATFORMS.map((platform) => ({
                    value: platform.value,
                    label: platform.label,
                  }))}
                />
              )}
              {definition.filters.includes("channel") && (
                <FilterSelect
                  param="channel"
                  label="Channel"
                  allLabel="All channels"
                  options={SALES_CHANNELS.map((channel) => ({ value: channel, label: channel }))}
                />
              )}
              <ClearFiltersButton />
            </FilterBar>
          ) : undefined
        }
      />

      <PageBody className="space-y-3">
        {data.truncated && (
          <div className="rounded-xl border border-warning-border bg-warning-soft p-3.5">
            <p className="text-[13px] leading-relaxed text-warning">
              This report is showing the most recent {data.rowCount.toLocaleString()} rows. Narrow
              the date range to see everything in one report.
            </p>
          </div>
        )}

        <Card className="overflow-hidden print-full">
          {data.rows.length === 0 ? (
            <p className="px-5 py-16 text-center text-[13.5px] text-muted">
              No data for {range.label.toLowerCase()}. Try a wider date range or clear the filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead className="border-b border-border-subtle bg-surface-muted">
                  <tr>
                    {data.columns.map((column, index) => (
                      <th
                        key={column}
                        scope="col"
                        className={cn(
                          "px-3.5 py-2.5 text-[12px] font-semibold tracking-wide whitespace-nowrap text-muted-strong uppercase",
                          data.numericColumns.includes(index) ? "text-right" : "text-left",
                        )}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {data.rows.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className="border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-muted/60"
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className={cn(
                            "px-3.5 py-2.5 whitespace-nowrap",
                            data.numericColumns.includes(cellIndex)
                              ? "tabular text-right text-foreground"
                              : "text-muted-strong",
                            cellIndex === 0 && "font-medium text-foreground",
                          )}
                        >
                          {cell === "" || cell === null ? (
                            <span className="text-subtle">—</span>
                          ) : (
                            cell
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>

                {data.totalsRow && (
                  <tfoot className="border-t-2 border-border-strong bg-surface-muted font-semibold">
                    <tr>
                      {data.totalsRow.map((cell, index) => (
                        <td
                          key={index}
                          className={cn(
                            "px-3.5 py-2.5 whitespace-nowrap",
                            data.numericColumns.includes(index) ? "tabular text-right" : "text-left",
                          )}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>

        <p className="text-[12.5px] text-muted">
          {data.rowCount.toLocaleString()} row{data.rowCount === 1 ? "" : "s"} · figures in{" "}
          {store.baseCurrency}
        </p>
      </PageBody>
    </>
  );
}
