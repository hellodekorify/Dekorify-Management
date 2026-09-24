"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RowAction {
  label: string;
  onSelect: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "danger";
}

export function RowActions({ actions, label = "Row actions" }: { actions: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [alignUp, setAlignUp] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    // Flip the menu upwards when the row sits near the bottom of the viewport.
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setAlignUp(window.innerHeight - rect.bottom < 190);

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "animate-scale-in absolute right-0 z-30 w-44 overflow-hidden rounded-lg border border-border-subtle bg-surface py-1",
            alignUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-muted",
                action.tone === "danger" ? "text-negative" : "text-foreground",
              )}
            >
              {action.icon && <action.icon className="h-4 w-4 shrink-0" />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
