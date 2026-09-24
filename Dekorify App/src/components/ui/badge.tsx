import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "positive" | "negative" | "warning" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted-strong border-border-strong",
  brand: "bg-brand-soft text-brand border-brand-border",
  positive: "bg-positive-soft text-positive border-positive-border",
  negative: "bg-negative-soft text-negative border-negative-border",
  warning: "bg-warning-soft text-warning border-warning-border",
  info: "bg-info-soft text-info border-info-border",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  );
}

/** A small coloured swatch used beside category and platform names. */
export function Swatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-sm", className)}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}
