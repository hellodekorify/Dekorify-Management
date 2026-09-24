import {
  AlertTriangle,
  Check,
  CircleDot,
  Clock,
  Hand,
  RotateCcw,
  Truck,
  X,
} from "lucide-react";
import { statusDef, type StatusTone } from "@/lib/orders/statuses";
import { cn } from "@/lib/utils";

export interface TimelineEvent {
  id: string;
  occurredAt: Date;
  source: string;
  internalStatus: string;
  courierStatus: string | null;
  location: string | null;
  description: string | null;
  notes: string | null;
  userName: string | null;
}

const RAIL_TONE: Record<StatusTone, string> = {
  neutral: "bg-subtle",
  info: "bg-info",
  brand: "bg-brand",
  warning: "bg-warning",
  negative: "bg-negative",
  positive: "bg-positive",
};

const RING_TONE: Record<StatusTone, string> = {
  neutral: "border-border-strong bg-surface text-muted",
  info: "border-info-border bg-info-soft text-info",
  brand: "border-brand-border bg-brand-soft text-brand",
  warning: "border-warning-border bg-warning-soft text-warning",
  negative: "border-negative-border bg-negative-soft text-negative",
  positive: "border-positive-border bg-positive-soft text-positive",
};

const SOURCE_LABEL: Record<string, string> = {
  LEOPARDS: "Leopards",
  SHOPIFY: "Shopify",
  MANUAL: "Manual",
  SYSTEM: "System",
};

function iconFor(status: string, isCurrent: boolean) {
  const definition = statusDef(status);
  if (definition.isTerminal && definition.tone === "positive") return Check;
  if (definition.tone === "negative") return X;
  if (definition.isIssue) return AlertTriangle;
  if (status === "RESCHEDULED") return RotateCcw;
  if (status === "OUT_FOR_DELIVERY") return Truck;
  if (status === "DELIVERY_ATTEMPTED") return Hand;
  return isCurrent ? CircleDot : Check;
}

/**
 * Chronological history, newest last so it reads like a story.
 *
 * Every event shows both the courier's own wording and the internal status it
 * mapped to — the mapping is a convenience, not a replacement, and hiding the
 * original would make a wrong mapping impossible to spot.
 */
export function TrackingTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="mb-3 rounded-full bg-surface-muted p-3">
          <Clock className="h-5 w-5 text-subtle" aria-hidden />
        </span>
        <p className="text-[14px] font-medium text-foreground">No tracking events yet</p>
        <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-muted">
          Once the order is booked with a courier, its journey will appear here.
        </p>
      </div>
    );
  }

  const lastIndex = events.length - 1;

  return (
    <ol className="relative px-4 py-4 sm:px-5">
      {events.map((event, index) => {
        const definition = statusDef(event.internalStatus);
        const isCurrent = index === lastIndex;
        const Icon = iconFor(event.internalStatus, isCurrent);

        return (
          <li key={event.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {/* Connector */}
            {index !== lastIndex && (
              <span
                className={cn(
                  "absolute top-8 left-[15px] w-px",
                  "h-[calc(100%-1rem)]",
                  RAIL_TONE[definition.tone],
                  "opacity-25",
                )}
                aria-hidden
              />
            )}

            <span
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                RING_TONE[definition.tone],
                isCurrent && "ring-2 ring-offset-2 ring-offset-[var(--surface)]",
                isCurrent && definition.tone === "positive" && "ring-positive/30",
                isCurrent && definition.tone === "negative" && "ring-negative/30",
                isCurrent && definition.tone === "warning" && "ring-warning/30",
                isCurrent &&
                  (definition.tone === "info" ||
                    definition.tone === "brand" ||
                    definition.tone === "neutral") &&
                  "ring-brand/25",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <p
                  className={cn(
                    "text-[14px] font-semibold",
                    isCurrent ? "text-foreground" : "text-muted-strong",
                  )}
                >
                  {definition.label}
                </p>
                {isCurrent && (
                  <span className="rounded bg-brand px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-white uppercase">
                    Current
                  </span>
                )}
                <span className="tabular text-[12px] text-muted">
                  {formatEventTime(event.occurredAt)}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                <span className="rounded border border-border-subtle bg-surface-muted px-1.5 py-0.5">
                  {SOURCE_LABEL[event.source] ?? event.source}
                </span>
                {event.courierStatus && (
                  <span title="Exact wording from the courier">“{event.courierStatus}”</span>
                )}
                {event.location && <span>· {event.location}</span>}
                {event.userName && <span>· by {event.userName}</span>}
              </div>

              {(event.description || event.notes) && (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-strong">
                  {[event.description, event.notes].filter(Boolean).join(" — ")}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function formatEventTime(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
