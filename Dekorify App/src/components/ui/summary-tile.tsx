import { cn } from "@/lib/utils";

/** Compact figure shown above a transaction table. */
export function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div
      className="rounded-xl border border-border-subtle bg-surface px-4 py-3.5"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p
        className={cn(
          "tabular mt-1 truncate text-[19px] font-semibold tracking-[-0.02em]",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          !tone && "text-foreground",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[12px] text-muted">{sub}</p>}
    </div>
  );
}
