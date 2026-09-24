"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, SlidersHorizontal, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Push a change to one query parameter, always resetting pagination. */
function useParamWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return { setParams, pending, searchParams };
}

export function SearchInput({ placeholder = "Search…" }: { placeholder?: string }) {
  const { setParams, pending, searchParams } = useParamWriter();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef(true);

  // Debounce so a query does not fire on every keystroke.
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParams({ q: value || null }), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9.5 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-9 text-sm shadow-sm placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
      />
      {pending ? (
        <Loader2
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted"
          aria-hidden
        />
      ) : value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function FilterSelect({
  param,
  label,
  options,
  allLabel = "All",
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  const { setParams, searchParams } = useParamWriter();
  const value = searchParams.get(param) ?? "";

  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => setParams({ [param]: event.target.value || null })}
      className={cn(
        "h-9.5 cursor-pointer rounded-lg border border-border-strong bg-surface px-2.5 pr-8 text-sm shadow-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none",
        value && "border-brand-border bg-brand-soft font-medium text-brand",
      )}
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Min/max amount pair, tucked behind a toggle so the toolbar stays calm. */
export function AmountFilter() {
  const { setParams, searchParams } = useParamWriter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [min, setMin] = useState(searchParams.get("min") ?? "");
  const [max, setMax] = useState(searchParams.get("max") ?? "");
  const active = Boolean(searchParams.get("min") || searchParams.get("max"));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "inline-flex h-9.5 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium shadow-sm transition-colors hover:bg-surface-muted",
          active && "border-brand-border bg-brand-soft text-brand",
        )}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Amount
      </button>

      {open && (
        <div
          className="animate-scale-in absolute right-0 top-full z-40 mt-1.5 w-64 rounded-xl border border-border-subtle bg-surface p-3"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11.5px] text-muted">Minimum</span>
              <input
                type="number"
                inputMode="decimal"
                value={min}
                onChange={(event) => setMin(event.target.value)}
                placeholder="0"
                className="h-8 w-full rounded-md border border-border-strong px-2 text-[12.5px] focus:border-brand focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] text-muted">Maximum</span>
              <input
                type="number"
                inputMode="decimal"
                value={max}
                onChange={(event) => setMax(event.target.value)}
                placeholder="Any"
                className="h-8 w-full rounded-md border border-border-strong px-2 text-[12.5px] focus:border-brand focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                setParams({ min: min || null, max: max || null });
                setOpen(false);
              }}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setMin("");
                setMax("");
                setParams({ min: null, max: null });
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ClearFiltersButton({ keep = ["range", "from", "to"] }: { keep?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const removable = [...searchParams.keys()].filter((key) => !keep.includes(key));
  if (removable.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const params = new URLSearchParams();
        for (const key of keep) {
          const value = searchParams.get(key);
          if (value) params.set(key, value);
        }
        router.push(`${pathname}${params.toString() ? `?${params}` : ""}`, { scroll: false });
      }}
      className="inline-flex h-9.5 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      <X className="h-3.5 w-3.5" aria-hidden />
      Clear filters
    </button>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
