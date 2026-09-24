import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted">
          <Compass className="h-6 w-6 text-muted" aria-hidden />
        </div>

        <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          That page does not exist, or it moved. The dashboard is a good place to start again.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex h-9.5 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-hover"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
