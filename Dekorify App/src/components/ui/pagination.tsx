import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-[12.5px] text-muted">
        {total === 0 ? (
          "No records"
        ) : (
          <>
            Showing <span className="font-medium text-foreground">{first.toLocaleString()}</span>–
            <span className="font-medium text-foreground">{last.toLocaleString()}</span> of{" "}
            <span className="font-medium text-foreground">{total.toLocaleString()}</span>
          </>
        )}
      </p>

      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <PageLink href={hrefFor(page - 1)} disabled={page <= 1} label="Previous page">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </PageLink>

          {pageNumbers(page, pageCount).map((value, index) =>
            value === "…" ? (
              <span key={`gap-${index}`} className="px-1.5 text-[13px] text-subtle">
                …
              </span>
            ) : (
              <PageLink key={value} href={hrefFor(value)} active={value === page} label={`Page ${value}`}>
                {value}
              </PageLink>
            ),
          )}

          <PageLink href={hrefFor(page + 1)} disabled={page >= pageCount} label="Next page">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  href,
  children,
  active,
  disabled,
  label,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const className = cn(
    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] font-medium transition-colors",
    active
      ? "bg-brand text-white"
      : disabled
        ? "cursor-not-allowed text-subtle"
        : "text-muted-strong hover:bg-surface-muted hover:text-foreground",
  );

  if (disabled) {
    return (
      <span className={className} aria-disabled="true" aria-label={label}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      scroll={false}
      className={className}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 */
function pageNumbers(current: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);

  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);

  if (start > 2) pages.push("…");
  for (let value = start; value <= end; value++) pages.push(value);
  if (end < count - 1) pages.push("…");
  pages.push(count);

  return pages;
}
