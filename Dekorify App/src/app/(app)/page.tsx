import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Boxes,
  Megaphone,
  Percent,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { requireContext } from "@/lib/auth";
import {
  breakdownAdSpendByPlatform,
  breakdownExpensesByCategory,
  buildTimeSeries,
  deltaOf,
  loadDataset,
  summarise,
} from "@/lib/finance";
import { resolveDateRange, previousPeriod, type DatePreset } from "@/lib/dates";
import { formatMoney, formatNumber, formatPercent } from "@/lib/currency";
import { adPlatformColor, adPlatformLabel } from "@/lib/constants";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  CashFlowChart,
  DonutChart,
  GroupedBarChart,
  ProfitBarChart,
  TrendChart,
} from "@/components/charts/chart-kit";
import { ProfitHero } from "./profit-hero";
import { EmptyDashboard } from "./empty-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
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
  const comparison = previousPeriod(range);

  const [dataset, previousDataset] = await Promise.all([
    loadDataset(store.id, range),
    loadDataset(store.id, comparison),
  ]);

  const summary = summarise(dataset);
  const previous = summarise(previousDataset);
  const { points, granularity } = buildTimeSeries(dataset);

  const expenseBreakdown = breakdownExpensesByCategory(dataset);
  const adBreakdown = breakdownAdSpendByPlatform(dataset).map((row) => ({
    ...row,
    label: adPlatformLabel(row.key),
    color: adPlatformColor(row.key),
  }));

  const hasAnyData =
    summary.ordersAll > 0 ||
    summary.cogs !== 0n ||
    summary.adSpend !== 0n ||
    summary.operatingExpenses !== 0n ||
    summary.fulfilmentExpenses !== 0n;

  const currency = store.baseCurrency;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${store.name} · ${range.label}`}
        actions={<DateRangeFilter label={range.label} />}
      />

      <PageBody className="space-y-6">
        {!hasAnyData ? (
          <EmptyDashboard periodLabel={range.label} />
        ) : (
          <>
            <ProfitHero summary={summary} previous={previous} currency={currency} range={range.label} />

            <section aria-label="Key figures">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label="Net revenue"
                  value={formatMoney(summary.netRevenue, currency)}
                  delta={deltaOf(summary.netRevenue, previous.netRevenue)}
                  currency={currency}
                  icon={Banknote}
                  accent="brand"
                  sub={`${formatNumber(summary.orders)} orders`}
                />
                <KpiCard
                  label="Gross profit"
                  value={formatMoney(summary.grossProfit, currency)}
                  delta={deltaOf(summary.grossProfit, previous.grossProfit)}
                  currency={currency}
                  icon={TrendingUp}
                  accent={summary.grossProfit >= 0n ? "positive" : "negative"}
                  sub={`${formatPercent(summary.grossMarginPct)} margin`}
                />
                <KpiCard
                  label="Net profit"
                  value={formatMoney(summary.netProfit, currency)}
                  delta={deltaOf(summary.netProfit, previous.netProfit)}
                  currency={currency}
                  icon={Wallet}
                  accent={summary.netProfit >= 0n ? "positive" : "negative"}
                  sub={`${formatPercent(summary.netProfitMarginPct)} margin`}
                />
                <KpiCard
                  label="Average order value"
                  value={formatMoney(summary.averageOrderValue, currency)}
                  delta={deltaOf(summary.averageOrderValue, previous.averageOrderValue)}
                  currency={currency}
                  icon={ShoppingCart}
                  sub={`${formatNumber(summary.units)} units`}
                />

                <KpiCard
                  label="Cost of goods sold"
                  value={formatMoney(summary.cogs, currency)}
                  delta={deltaOf(summary.cogs, previous.cogs)}
                  deltaGoodWhen="down"
                  currency={currency}
                  icon={Boxes}
                  sub={`${formatPercent(summary.cogsPctOfRevenue)} of revenue`}
                />
                <KpiCard
                  label="Advertising spend"
                  value={formatMoney(summary.adSpend, currency)}
                  delta={deltaOf(summary.adSpend, previous.adSpend)}
                  deltaGoodWhen="down"
                  currency={currency}
                  icon={Megaphone}
                  sub={
                    summary.roas === null
                      ? "No ad spend recorded"
                      : `${summary.roas.toFixed(2)}× ROAS · ${formatPercent(summary.tacosPct)} TACOS`
                  }
                />
                <KpiCard
                  label="Operating expenses"
                  value={formatMoney(summary.operatingExpenses, currency)}
                  delta={deltaOf(summary.operatingExpenses, previous.operatingExpenses)}
                  deltaGoodWhen="down"
                  currency={currency}
                  icon={Receipt}
                  sub={`Plus ${formatMoney(summary.fulfilmentExpenses + summary.paymentFees, currency)} fulfilment`}
                />
                <KpiCard
                  label="Net cash flow"
                  value={formatMoney(summary.netCashFlow, currency)}
                  delta={deltaOf(summary.netCashFlow, previous.netCashFlow)}
                  currency={currency}
                  icon={Percent}
                  accent={summary.netCashFlow >= 0n ? "positive" : "negative"}
                  sub={`In ${formatMoney(summary.cashIn, currency)} · Out ${formatMoney(summary.cashOut, currency)}`}
                />
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader
                  title="Revenue, cost and profit"
                  description={`By ${granularity === "day" ? "day" : "month"} across ${range.label.toLowerCase()}`}
                />
                <CardBody>
                  <TrendChart
                    data={points}
                    currency={currency}
                    series={[
                      { dataKey: "revenue", name: "Net revenue", color: "#4f46e5", type: "area" },
                      { dataKey: "cogs", name: "COGS", color: "#f59e0b", type: "line" },
                      { dataKey: "adSpend", name: "Ad spend", color: "#ec4899", type: "line" },
                      { dataKey: "netProfit", name: "Net profit", color: "#10b981", type: "line" },
                    ]}
                    height={320}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Where the money goes"
                  description="Operating expenses by category"
                  action={
                    <Link
                      href="/expenses"
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
                    >
                      View
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  }
                />
                <CardBody>
                  {expenseBreakdown.length === 0 ? (
                    <p className="py-12 text-center text-[13px] text-muted">
                      No expenses recorded in this period.
                    </p>
                  ) : (
                    <>
                      <DonutChart data={expenseBreakdown} currency={currency} height={210} />
                      <ul className="mt-4 space-y-2">
                        {expenseBreakdown.slice(0, 5).map((row) => (
                          <li key={row.key} className="flex items-center gap-2.5 text-[13px]">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-sm"
                              style={{ backgroundColor: row.color ?? "#94a3b8" }}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate text-muted-strong">
                              {row.label}
                            </span>
                            <span className="tabular shrink-0 font-medium">
                              {formatMoney(row.amount, currency)}
                            </span>
                            <span className="tabular w-12 shrink-0 text-right text-muted">
                              {formatPercent(row.sharePct, 0)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </CardBody>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card>
                <CardHeader title="Net profit by period" description="Green is profit, red is loss" />
                <CardBody>
                  <ProfitBarChart
                    data={points}
                    dataKey="netProfit"
                    name="Net profit"
                    currency={currency}
                    height={240}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Cash in and out" description="Movement across the period" />
                <CardBody>
                  <CashFlowChart data={points} currency={currency} height={240} />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Advertising by platform"
                  description={
                    summary.adSpend === 0n
                      ? "No ad spend recorded"
                      : `${formatMoney(summary.adSpend, currency)} total`
                  }
                  action={
                    <Link
                      href="/ads"
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
                    >
                      View
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  }
                />
                <CardBody>
                  {adBreakdown.length === 0 ? (
                    <p className="py-12 text-center text-[13px] text-muted">
                      No advertising spend in this period.
                    </p>
                  ) : (
                    <>
                      <DonutChart data={adBreakdown} currency={currency} height={190} />
                      <ul className="mt-4 space-y-2">
                        {adBreakdown.map((row) => (
                          <li key={row.key} className="flex items-center gap-2.5 text-[13px]">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-sm"
                              style={{ backgroundColor: row.color ?? "#94a3b8" }}
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

            <Card>
              <CardHeader
                title="Cost structure over time"
                description="COGS, advertising and other expenses stacked against net revenue"
              />
              <CardBody>
                <GroupedBarChart
                  data={points}
                  currency={currency}
                  stacked
                  series={[
                    { dataKey: "cogs", name: "COGS", color: "#f59e0b" },
                    { dataKey: "adSpend", name: "Advertising", color: "#ec4899" },
                    { dataKey: "expenses", name: "Other expenses", color: "#64748b" },
                  ]}
                  height={280}
                />
              </CardBody>
            </Card>
          </>
        )}
      </PageBody>
    </>
  );
}
