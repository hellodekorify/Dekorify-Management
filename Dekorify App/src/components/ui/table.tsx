import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/** Horizontally scrollable shell — wide financial tables must never break the page. */
export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-max border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border-subtle bg-surface-muted">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  align = "left",
  className,
  sortKey,
  currentSort,
  currentDir,
  sortHref,
  width,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  sortKey?: string;
  currentSort?: string;
  currentDir?: string;
  sortHref?: (key: string, dir: "asc" | "desc") => string;
  width?: string;
}) {
  const isActive = sortKey !== undefined && currentSort === sortKey;
  const nextDir: "asc" | "desc" = isActive && currentDir === "asc" ? "desc" : "asc";

  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        align === "right" && "flex-row-reverse",
      )}
    >
      {children}
      {sortKey !== undefined && sortHref && (
        <>
          {!isActive && <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />}
          {isActive && currentDir === "asc" && <ArrowUp className="h-3.5 w-3.5" aria-hidden />}
          {isActive && currentDir === "desc" && <ArrowDown className="h-3.5 w-3.5" aria-hidden />}
        </>
      )}
    </span>
  );

  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={cn(
        "px-3.5 py-2.5 text-[12px] font-semibold tracking-wide text-muted-strong uppercase whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {sortKey !== undefined && sortHref ? (
        <Link
          href={sortHref(sortKey, nextDir)}
          scroll={false}
          className={cn(
            "rounded transition-colors hover:text-foreground",
            isActive && "text-brand",
          )}
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </th>
  );
}

export function TR({
  children,
  className,
  muted,
}: {
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-muted/60",
        muted && "opacity-55",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  align = "left",
  className,
  numeric,
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  numeric?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-3.5 py-2.5 align-middle text-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
        numeric && "tabular whitespace-nowrap",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TableEmpty({
  colSpan,
  title = "Nothing here yet",
  description,
  action,
}: {
  colSpan: number;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14">
        <div className="mx-auto flex max-w-sm flex-col items-center text-center">
          <div className="mb-3 rounded-full bg-surface-muted p-3">
            <Inbox className="h-5 w-5 text-subtle" aria-hidden />
          </div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description && <p className="mt-1 text-[13px] leading-snug text-muted">{description}</p>}
          {action && <div className="mt-4">{action}</div>}
        </div>
      </td>
    </tr>
  );
}

/** Bold summary row pinned to the bottom of a financial table. */
export function TFootRow({ children }: { children: React.ReactNode }) {
  return (
    <tfoot className="border-t-2 border-border-strong bg-surface-muted font-semibold">
      <tr>{children}</tr>
    </tfoot>
  );
}
