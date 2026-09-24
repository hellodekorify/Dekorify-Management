import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { buildProfitAndLoss, loadDataset } from "@/lib/finance";
import { resolveDateRange, type DatePreset } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/currency";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { Card } from "@/components/ui/card";
import { SummaryTile } from "@/components/ui/summary-tile";
import { ExportMenu, type ExportPayload } from "@/components/export-menu";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Profit & Loss" };

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; view?: string }>;
}) {
  const { store } = await requireContext();
  const params = await searchParams;

  const range = resolveDateRange(
    (params.range as DatePreset) ?? "this_year",
    params.from,
    params.to,
  );
  const view = params.view === "total" ? "single" : "month";

  const dataset = await loadDataset(store.id, range);
  const statement = buildProfitAndLoss(dataset, view);
  const { totals } = statement;

  const currency = store.baseCurrency;
  const showColumns = view === "month" && statement.columns.length > 1;

  const exportPayload: ExportPayload = {
    title: `Profit and Loss — ${store.name}`,
    subtitle: range.label,
    columns: [
      "",
      ...(showColumns ? statement.columns.map((column) => column.label) : []),
      "Total",
    ],
    numericColumns: Array.from(
      { length: (showColumns ? statement.columns.length : 0) + 1 },
      (_, index) => index + 1,
    ),
    rows: statement.lines.map((line) => [
      `${"    ".repeat(line.level)}${line.label}`,
      ...(showColumns
        ? line.values.map((value, index) =>
            isHeading(line) ? "" : signed(value, line.isNegative, currency, index),
          )
        : []),
      isHeading(line) ? "" : signed(line.total, line.isNegative, currency),
    ]),
  };

  const buildHref = (nextView: string) => {
    const query = new URLSearchParams();
    if (params.range) query.set("range", params.range);
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    if (nextView === "total") query.set("view", "total");
    const text = query.toString();
    return `/profit-loss${text ? `?${text}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Profit & loss"
        description={`${store.name} · ${range.label} · all figures in ${currency}`}
        actions={
          <>
            <div className="flex rounded-lg border border-border-strong bg-surface p-0.5 shadow-sm">
              {[
                { value: "month", label: "By month" },
                { value: "total", label: "Total only" },
              ].map((option) => (
                <Link
                  key={option.value}
                  href={buildHref(option.value)}
                  scroll={false}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                    (option.value === "total" ? view === "single" : view === "month")
                      ? "bg-brand text-white"
                      : "text-muted-strong hover:text-foreground",
                  )}
                >
                  {option.label}
                </Link>
              ))}
            </div>
            <DateRangeFilter label={range.label} />
            <ExportMenu payload={exportPayload} />
          </>
        }
      />

      <PageBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            label="Net revenue"
            value={formatMoney(totals.netRevenue, currency)}
            sub={`${totals.orders.toLocaleString()} orders`}
          />
          <SummaryTile
            label="Gross profit"
            value={formatMoney(totals.grossProfit, currency)}
            tone={totals.grossProfit >= 0n ? "positive" : "negative"}
            sub={`${formatPercent(totals.grossMarginPct)} margin`}
          />
          <SummaryTile
            label="Total costs"
            value={formatMoney(totals.directCosts + totals.totalOperatingCosts, currency)}
            sub="Every direct and operating cost"
          />
          <SummaryTile
            label="Net profit"
            value={formatMoney(totals.netProfit, currency)}
            tone={totals.netProfit >= 0n ? "positive" : "negative"}
            sub={`${formatPercent(totals.netProfitMarginPct)} margin`}
          />
        </div>

        <Card className="overflow-hidden print-full">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead className="border-b border-border-strong bg-surface-muted">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-surface-muted px-4 py-3 text-left text-[12px] font-semibold tracking-wide text-muted-strong uppercase"
                  >
                    {range.label}
                  </th>
                  {showColumns &&
                    statement.columns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        className="px-4 py-3 text-right text-[12px] font-semibold tracking-wide whitespace-nowrap text-muted-strong uppercase"
                      >
                        {column.label}
                      </th>
                    ))}
                  <th
                    scope="col"
                    className="border-l border-border-strong bg-surface-muted px-4 py-3 text-right text-[12px] font-semibold tracking-wide text-muted-strong uppercase"
                  >
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {statement.lines.map((line) => {
                  const heading = isHeading(line);
                  const columnCount = (showColumns ? statement.columns.length : 0) + 2;

                  if (heading) {
                    return (
                      <tr key={line.id} className="bg-surface-muted/60">
                        <td
                          colSpan={columnCount}
                          className="sticky left-0 px-4 pt-4 pb-1.5 text-[11.5px] font-semibold tracking-wider text-muted uppercase"
                        >
                          {line.label}
                        </td>
                      </tr>
                    );
                  }

                  const emphasis = line.emphasis;

                  return (
                    <tr
                      key={line.id}
                      className={cn(
                        "border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-muted/40",
                        emphasis === "subtotal" && "border-t border-border-strong bg-surface-muted/40",
                        emphasis === "total" && "border-t-2 border-border-strong bg-brand-soft/40",
                      )}
                    >
                      <td
                        className={cn(
                          "sticky left-0 z-10 bg-surface px-4 py-2.5 whitespace-nowrap",
                          line.level === 1 && "pl-8",
                          emphasis === "subtotal" && "bg-surface-muted/40 font-semibold",
                          emphasis === "total" && "bg-brand-soft/40 text-[15px] font-semibold",
                          !emphasis || emphasis === "none" ? "text-muted-strong" : "text-foreground",
                        )}
                      >
                        {line.label}
                      </td>

                      {showColumns &&
                        line.values.map((value, index) => (
                          <td
                            key={index}
                            className={cn(
                              "tabular px-4 py-2.5 text-right whitespace-nowrap",
                              emphasis === "total" && "text-[15px] font-semibold",
                              emphasis === "subtotal" && "font-semibold",
                              valueTone(line, value),
                            )}
                          >
                            {signed(value, line.isNegative, currency)}
                            {line.marginPct?.[index] !== undefined && emphasis && (
                              <span className="mt-0.5 block text-[11.5px] font-normal text-muted">
                                {formatPercent(line.marginPct[index])}
                              </span>
                            )}
                          </td>
                        ))}

                      <td
                        className={cn(
                          "tabular border-l border-border-strong px-4 py-2.5 text-right font-medium whitespace-nowrap",
                          emphasis === "total" && "text-[15px] font-semibold",
                          emphasis === "subtotal" && "font-semibold",
                          valueTone(line, line.total),
                        )}
                      >
                        {signed(line.total, line.isNegative, currency)}
                        {line.totalMarginPct !== undefined && (
                          <span className="mt-0.5 block text-[11.5px] font-normal text-muted">
                            {formatPercent(line.totalMarginPct)} margin
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="text-[12.5px] leading-relaxed text-muted">
          Cancelled and returned orders are excluded from revenue. Payment processing fees are
          shown as a cost rather than netted off revenue, so the gross sales figure matches what
          your sales channel reports.
        </p>
      </PageBody>
    </>
  );
}

function isHeading(line: { values: bigint[]; emphasis?: string }): boolean {
  return line.values.length === 0 && line.emphasis === "none";
}

/** Costs are shown in brackets so the statement reads like a real P&L. */
function signed(
  value: bigint,
  isNegative: boolean | undefined,
  currency: string,
  _index?: number,
): string {
  if (isNegative) {
    return value === 0n ? "—" : `(${formatMoney(value, currency, { showCode: false })})`;
  }
  return formatMoney(value, currency, { showCode: false });
}

function valueTone(line: { emphasis?: string; isNegative?: boolean }, value: bigint): string {
  if (line.emphasis === "total") {
    return value >= 0n ? "text-positive" : "text-negative";
  }
  if (line.isNegative) return "text-muted-strong";
  return "text-foreground";
}
