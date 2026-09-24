import { statusDef, type StatusTone } from "@/lib/orders/statuses";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-surface-muted text-muted-strong border-border-strong",
  info: "bg-info-soft text-info border-info-border",
  brand: "bg-brand-soft text-brand border-brand-border",
  warning: "bg-warning-soft text-warning border-warning-border",
  negative: "bg-negative-soft text-negative border-negative-border",
  positive: "bg-positive-soft text-positive border-positive-border",
};

const DOT_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-subtle",
  info: "bg-info",
  brand: "bg-brand",
  warning: "bg-warning",
  negative: "bg-negative",
  positive: "bg-positive",
};

export function OrderStatusBadge({
  status,
  className,
  size = "md",
}: {
  status: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const definition = statusDef(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[11.5px]" : "px-2 py-0.5 text-[12px]",
        TONE_CLASSES[definition.tone],
        className,
      )}
      title={definition.description}
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASSES[definition.tone])}
        aria-hidden
      />
      {definition.label}
    </span>
  );
}

/** The courier's own wording, shown next to ours so nothing is hidden. */
export function CourierStatusChip({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <span
      className="inline-flex items-center rounded border border-border-subtle bg-surface-muted px-1.5 py-0.5 text-[11px] text-muted"
      title="Exact wording received from the courier"
    >
      {status}
    </span>
  );
}
