import { resolveDateRange, type DatePreset, type DateRange } from "./dates";
import { parseMoney } from "./money";

export const PAGE_SIZE = 25;

export interface ListParams {
  range: DateRange;
  search: string;
  page: number;
  pageSize: number;
  skip: number;
  sort: string;
  dir: "asc" | "desc";
  minMinor: bigint | null;
  maxMinor: bigint | null;
  raw: Record<string, string | undefined>;
}

/**
 * One place that turns URL query parameters into the shape every list page
 * needs, so search, date filtering, sorting and pagination behave identically
 * across Sales, Expenses, COGS and Ads.
 */
export function parseListParams(
  searchParams: Record<string, string | undefined>,
  options: { defaultSort?: string; defaultDir?: "asc" | "desc"; defaultRange?: DatePreset } = {},
): ListParams {
  const range = resolveDateRange(
    (searchParams.range as DatePreset) ?? options.defaultRange ?? "this_month",
    searchParams.from,
    searchParams.to,
  );

  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : options.defaultDir ?? "desc";

  return {
    range,
    search: (searchParams.q ?? "").trim(),
    page,
    pageSize: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
    sort: searchParams.sort ?? options.defaultSort ?? "date",
    dir,
    minMinor: searchParams.min ? parseMoney(searchParams.min) : null,
    maxMinor: searchParams.max ? parseMoney(searchParams.max) : null,
    raw: searchParams,
  };
}

/** Amount range translated into a Prisma filter on a BigInt column. */
export function amountFilter(params: ListParams) {
  if (params.minMinor === null && params.maxMinor === null) return undefined;
  return {
    ...(params.minMinor !== null ? { gte: params.minMinor } : {}),
    ...(params.maxMinor !== null ? { lte: params.maxMinor } : {}),
  };
}

/** Builds the hrefs the table headers and pager link to, preserving filters. */
export function makeLinkBuilders(pathname: string, raw: Record<string, string | undefined>) {
  const base = () => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
      if (value) params.set(key, value);
    }
    return params;
  };

  return {
    pageHref(page: number): string {
      const params = base();
      if (page <= 1) params.delete("page");
      else params.set("page", String(page));
      const query = params.toString();
      return `${pathname}${query ? `?${query}` : ""}`;
    },
    sortHref(sort: string, dir: "asc" | "desc"): string {
      const params = base();
      params.set("sort", sort);
      params.set("dir", dir);
      params.delete("page");
      return `${pathname}?${params.toString()}`;
    },
  };
}

/** SQLite has no case-insensitive `mode`, so searches match as stored. */
export function contains(value: string) {
  return { contains: value };
}
