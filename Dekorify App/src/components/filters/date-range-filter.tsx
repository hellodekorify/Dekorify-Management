"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";
import { DATE_PRESETS, type DatePreset } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DateRangeFilter({ label }: { label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const currentPreset = (searchParams.get("range") as DatePreset) ?? "this_month";
  const [customFrom, setCustomFrom] = useState(searchParams.get("from") ?? "");
  const [customTo, setCustomTo] = useState(searchParams.get("to") ?? "");

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function apply(preset: DatePreset, from?: string, to?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", preset);

    if (preset === "custom" && from && to) {
      params.set("from", from);
      params.set("to", to);
    } else {
      params.delete("from");
      params.delete("to");
    }

    // A new period means page 1 of any table below it.
    params.delete("page");

    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-9.5 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
      >
        <Calendar className="h-4 w-4 text-muted" aria-hidden />
        <span className="max-w-[190px] truncate">{label}</span>
        <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date range"
          className="animate-scale-in absolute top-full right-0 z-40 mt-1.5 w-[280px] overflow-hidden rounded-xl border border-border-subtle bg-surface"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          <div className="max-h-[280px] overflow-y-auto p-1.5">
            {DATE_PRESETS.filter((preset) => preset.value !== "custom").map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => apply(preset.value)}
                className={cn(
                  "block w-full rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors hover:bg-surface-muted",
                  currentPreset === preset.value && "bg-brand-soft font-medium text-brand",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="border-t border-border-subtle bg-surface-muted p-3">
            <p className="mb-2 text-[12px] font-semibold tracking-wide text-muted-strong uppercase">
              Custom range
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11.5px] text-muted">From</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="h-8 w-full rounded-md border border-border-strong bg-surface px-2 text-[12.5px] focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] text-muted">To</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="h-8 w-full rounded-md border border-border-strong bg-surface px-2 text-[12.5px] focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                />
              </label>
            </div>
            <Button
              size="sm"
              className="mt-2.5 w-full"
              disabled={!customFrom || !customTo || customFrom > customTo}
              onClick={() => apply("custom", customFrom, customTo)}
            >
              Apply range
            </Button>
            {customFrom && customTo && customFrom > customTo && (
              <p className="mt-1.5 text-[12px] text-negative">
                The start date must be before the end date.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
