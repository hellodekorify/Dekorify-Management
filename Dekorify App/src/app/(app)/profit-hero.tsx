import { TrendingDown, TrendingUp } from "lucide-react";
import { formatMoney, formatPercent } from "@/lib/currency";
import type { FinancialSummary, Delta } from "@/lib/finance";
import { deltaOf } from "@/lib/finance";
import { cn } from "@/lib/utils";

/**
 * The one block that answers "how much money did my business make?" — the
 * whole arithmetic from revenue down to net profit, in the order it happens.
 */
export function ProfitHero({
  summary,
  previous,
  currency,
  range,
}: {
  summary: FinancialSummary;
  previous: FinancialSummary;
  currency: string;
  range: string;
}) {
  const profitable = summary.netProfit > 0n;
  const breakeven = summary.netProfit === 0n;
  const delta = deltaOf(summary.netProfit, previous.netProfit);

  const fulfilment = summary.fulfilmentExpenses + summary.paymentFees;

  const steps: { label: string; amount: bigint; sign: "plus" | "minus" }[] = [
    { label: "Net revenue", amount: summary.netRevenue, sign: "plus" },
    { label: "Cost of goods sold", amount: summary.cogs, sign: "minus" },
    ...(fulfilment > 0n
      ? [{ label: "Fulfilment & delivery", amount: fulfilment, sign: "minus" as const }]
      : []),
    { label: "Gross profit", amount: summary.grossProfit, sign: "plus" },
    { label: "Advertising", amount: summary.adSpend, sign: "minus" },
    { label: "Operating expenses", amount: summary.operatingExpenses, sign: "minus" },
  ];

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border-subtle bg-surface"
      style={{ boxShadow: "var(--shadow-md)" }}
      aria-label="Profit summary"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* The working */}
        <div className="p-5 sm:p-6">
          <p className="text-[12px] font-semibold tracking-wider text-muted uppercase">
            {range}
          </p>
          <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
            How the profit was made
          </h2>

          <dl className="mt-5 space-y-0">
            {steps.map((step, index) => {
              const isSubtotal = step.label === "Gross profit";
              return (
                <div
                  key={step.label}
                  className={cn(
                    "flex items-baseline justify-between gap-4 py-2.5",
                    index > 0 && "border-t border-border-subtle",
                    isSubtotal && "border-t-2 border-border-strong",
                  )}
                >
                  <dt
                    className={cn(
                      "flex items-baseline gap-2 text-[14px]",
                      isSubtotal ? "font-semibold text-foreground" : "text-muted-strong",
                    )}
                  >
                    {step.sign === "minus" && (
                      <span className="text-[13px] text-subtle">less</span>
                    )}
                    {step.label}
                  </dt>
                  <dd
                    className={cn(
                      "tabular shrink-0 text-[15px] font-medium",
                      isSubtotal ? "font-semibold text-foreground" : "text-foreground",
                      step.sign === "minus" && "text-muted-strong",
                    )}
                  >
                    {step.sign === "minus" ? "−" : ""}
                    {formatMoney(step.amount, currency)}
                  </dd>
                </div>
              );
            })}
          </dl>

          {summary.otherAppropriations > 0n && (
            <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-[12.5px] leading-relaxed text-muted">
              A further {formatMoney(summary.otherAppropriations, currency)} sits below the line
              (zakat, drawings and tax), leaving{" "}
              <span className="font-medium text-foreground">
                {formatMoney(summary.profitAfterAppropriations, currency)}
              </span>
              .
            </p>
          )}
        </div>

        {/* The answer */}
        <div
          className={cn(
            "flex flex-col justify-center border-t border-border-subtle p-5 sm:p-6 lg:border-t-0 lg:border-l",
            profitable && "bg-positive-soft",
            !profitable && !breakeven && "bg-negative-soft",
            breakeven && "bg-surface-muted",
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg",
                profitable ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative",
              )}
            >
              {profitable ? (
                <TrendingUp className="h-4 w-4" aria-hidden />
              ) : (
                <TrendingDown className="h-4 w-4" aria-hidden />
              )}
            </span>
            <p
              className={cn(
                "text-[12px] font-semibold tracking-wider uppercase",
                profitable ? "text-positive" : breakeven ? "text-muted" : "text-negative",
              )}
            >
              Net {profitable ? "profit" : breakeven ? "result" : "loss"}
            </p>
          </div>

          <p
            className={cn(
              "tabular mt-3 text-[34px] leading-none font-semibold tracking-[-0.03em] sm:text-[38px]",
              profitable ? "text-positive" : breakeven ? "text-foreground" : "text-negative",
            )}
          >
            {formatMoney(summary.netProfit < 0n ? -summary.netProfit : summary.netProfit, currency)}
          </p>

          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-strong">
            {breakeven ? (
              "The business broke even in this period."
            ) : profitable ? (
              <>
                The business kept{" "}
                <span className="font-semibold text-foreground">
                  {formatPercent(summary.netProfitMarginPct)}
                </span>{" "}
                of every rupee it took in.
              </>
            ) : (
              <>
                Costs exceeded revenue by{" "}
                <span className="font-semibold text-foreground">
                  {formatPercent(
                    summary.netProfitMarginPct === null ? null : Math.abs(summary.netProfitMarginPct),
                  )}
                </span>{" "}
                of net revenue.
              </>
            )}
          </p>

          <HeroDelta delta={delta} currency={currency} />
        </div>
      </div>
    </section>
  );
}

function HeroDelta({ delta, currency }: { delta: Delta; currency: string }) {
  if (delta.direction === "flat") return null;

  const improved = delta.direction === "up";

  return (
    <p className="mt-4 border-t border-black/5 pt-3.5 text-[12.5px] text-muted-strong">
      <span className={cn("font-semibold", improved ? "text-positive" : "text-negative")}>
        {improved ? "▲" : "▼"} {formatMoney(delta.absolute < 0n ? -delta.absolute : delta.absolute, currency)}
      </span>{" "}
      compared with the previous period
    </p>
  );
}
