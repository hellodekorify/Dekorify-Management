"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertOctagon, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-negative-soft">
          <AlertOctagon className="h-6 w-6 text-negative" aria-hidden />
        </div>

        <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          No data was changed. Try again, and if it keeps happening the message below will help
          track down the cause.
        </p>

        {error.digest && (
          <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 font-mono text-[11.5px] text-muted">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-6 flex justify-center gap-2.5">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9.5 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-hover"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-9.5 items-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium shadow-sm transition-colors hover:bg-surface-muted"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
