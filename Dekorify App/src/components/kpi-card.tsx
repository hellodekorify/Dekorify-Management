import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { formatMoney, formatPercent } from "@/lib/currency";
import type { Delta } from "@/lib/finance";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaGoodWhen = "up",
  icon: Icon,
  accent,
  currency,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: Delta | null;
  /** For costs, a rise is bad — flip the colour so green always means "good". */
  deltaGoodWhen?: "up" | "down";
  icon?: LucideIcon;
  accent?: "brand" | "positive" | "negative" | "neutral";
  currency?: string;
}) {
  return (
    <div
      className="rounded-xl border border-border-subtle bg-surface p-4"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-muted">{label}</p>
        {Icon && (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              accent === "positive" && "bg-positive-soft text-positive",
              accent === "negative" && "bg-negative-soft text-negative",
              accent === "brand" && "bg-brand-soft text-brand",
              (!accent || accent === "neutral") && "bg-surface-muted text-muted",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>

      <p
        className={cn(
          "tabular mt-2 text-[22px] leading-tight font-semibold tracking-[-0.02em]",
          accent === "positive" && "text-positive",
          accent === "negative" && "text-negative",
          (!accent || accent === "neutral" || accent === "brand") && "text-foreground",
        )}
      >
        {value}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta && <DeltaBadge delta={delta} goodWhen={deltaGoodWhen} currency={currency} />}
        {sub && <span className="text-[12px] text-muted">{sub}</span>}
      </div>
    </div>
  );
}

export function DeltaBadge({
  delta,
  goodWhen = "up",
  currency,
}: {
  delta: Delta;
  goodWhen?: "up" | "down";
  currency?: string;
}) {
  if (delta.direction === "flat") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted">
        <Minus className="h-3 w-3" aria-hidden />
        No change
      </span>
    );
  }

  const isGood = goodWhen === "up" ? delta.direction === "up" : delta.direction === "down";
  const Icon = delta.direction === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[12px] font-semibold",
        isGood ? "text-positive" : "text-negative",
      )}
      title={
        currency
          ? `${delta.absolute >= 0n ? "+" : ""}${formatMoney(delta.absolute, currency)} vs previous period`
          : undefined
      }
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {delta.percent === null ? "new" : formatPercent(Math.abs(delta.percent), 1)}
    </span>
  );
}
