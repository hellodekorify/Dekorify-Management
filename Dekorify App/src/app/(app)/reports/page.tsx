import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileBarChart } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { REPORTS } from "@/lib/reports";
import { reportOverview } from "@/lib/reports";
import { resolveDateRange, type DatePreset } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/currency";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { SummaryTile } from "@/components/ui/summary-tile";
import { buildQuery } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { store } = await requireContext();
  const params = await searchParams;

  const range = resolveDateRange(
    (params.range as DatePreset) ?? "this_month",
    params.from,
    params.to,
  );

  const { summary } = await reportOverview(store.id, range);
  const currency = store.baseCurrency;

  // Carry the chosen period through to whichever report is opened.
  const query = buildQuery({ range: params.range, from: params.from, to: params.to });

  return (
    <>
      <PageHeader
        title="Reports"
        description="Filter any report by period, then export it to Excel, CSV or PDF."
        actions={<DateRangeFilter label={range.label} />}
      />

      <PageBody className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            label={`Net revenue · ${range.label.toLowerCase()}`}
            value={formatMoney(summary.netRevenue, currency)}
            sub={`${summary.orders.toLocaleString()} orders`}
          />
          <SummaryTile
            label="Gross profit"
            value={formatMoney(summary.grossProfit, currency)}
            tone={summary.grossProfit >= 0n ? "positive" : "negative"}
            sub={`${formatPercent(summary.grossMarginPct)} margin`}
          />
          <SummaryTile
            label="Total costs"
            value={formatMoney(summary.directCosts + summary.totalOperatingCosts, currency)}
            sub="Direct plus operating"
          />
          <SummaryTile
            label="Net profit"
            value={formatMoney(summary.netProfit, currency)}
            tone={summary.netProfit >= 0n ? "positive" : "negative"}
            sub={`${formatPercent(summary.netProfitMarginPct)} margin`}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {REPORTS.map((report) => (
            <Link
              key={report.id}
              href={`${report.href ?? `/reports/${report.id}`}${query}`}
              className="group flex flex-col rounded-xl border border-border-subtle bg-surface p-4 transition-colors hover:border-brand-border hover:bg-brand-soft/25"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-muted-strong transition-colors group-hover:bg-brand group-hover:text-white">
                <FileBarChart className="h-4.5 w-4.5" aria-hidden />
              </span>
              <p className="mt-3 flex items-center gap-1.5 text-[14.5px] font-semibold text-foreground">
                {report.title}
                <ArrowRight
                  className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{report.description}</p>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
