import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subYears,
  eachMonthOfInterval,
  eachDayOfInterval,
  isValid,
} from "date-fns";

export type DatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_7_days"
  | "this_month"
  | "last_month"
  | "last_30_days"
  | "this_year"
  | "last_year"
  | "all_time"
  | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  preset: DatePreset;
  label: string;
}

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "all_time", label: "All time" },
  { value: "custom", label: "Custom range" },
];

/** Earliest date we treat as "all time" — before any plausible transaction. */
const EPOCH = new Date(2000, 0, 1);

function capToToday(date: Date, now: Date): Date {
  const today = endOfDay(now);
  return date > today ? today : date;
}

export function resolveDateRange(
  preset: DatePreset,
  customFrom?: string | null,
  customTo?: string | null,
  now: Date = new Date(),
): DateRange {
  const label = DATE_PRESETS.find((p) => p.value === preset)?.label ?? "This month";

  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), preset, label };
    case "yesterday": {
      const day = subDays(now, 1);
      return { from: startOfDay(day), to: endOfDay(day), preset, label };
    }
    // Current periods stop at today. A business cannot have data in the future,
    // and trailing empty months make a report look broken rather than current.
    case "this_week":
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }),
        to: capToToday(endOfWeek(now, { weekStartsOn: 1 }), now),
        preset,
        label,
      };
    case "last_7_days":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), preset, label };
    case "this_month":
      return { from: startOfMonth(now), to: capToToday(endOfMonth(now), now), preset, label };
    case "last_month": {
      const previous = subMonths(now, 1);
      return { from: startOfMonth(previous), to: endOfMonth(previous), preset, label };
    }
    case "last_30_days":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now), preset, label };
    case "this_year":
      return { from: startOfYear(now), to: capToToday(endOfYear(now), now), preset, label };
    case "last_year": {
      const previous = subYears(now, 1);
      return { from: startOfYear(previous), to: endOfYear(previous), preset, label };
    }
    case "all_time":
      return { from: EPOCH, to: endOfDay(now), preset, label };
    case "custom": {
      const from = parseDateInput(customFrom) ?? startOfMonth(now);
      const to = parseDateInput(customTo) ?? endOfDay(now);
      return {
        from: startOfDay(from),
        to: endOfDay(to),
        preset,
        label: `${formatDate(from)} – ${formatDate(to)}`,
      };
    }
    default:
      return { from: startOfMonth(now), to: endOfMonth(now), preset: "this_month", label };
  }
}

/**
 * The equivalent range one period earlier.
 *
 * For calendar presets this is the *same span of the previous calendar period*
 * — 1–22 August compares against 1–22 July, not against the 22 days that
 * happened to precede it. Straddling a month boundary makes anything billed
 * monthly (rent, salaries, stock purchases) look like a wild swing.
 *
 * Rolling presets keep the simple "immediately preceding equal span".
 */
export function previousPeriod(range: DateRange): { from: Date; to: Date } {
  switch (range.preset) {
    case "this_month":
    case "last_month":
      return shiftBy(range, (date) => subMonths(date, 1));
    case "this_year":
    case "last_year":
      return shiftBy(range, (date) => subYears(date, 1));
    case "this_week":
      return shiftBy(range, (date) => subDays(date, 7));
    default: {
      const spanMs = range.to.getTime() - range.from.getTime();
      const to = new Date(range.from.getTime() - 1);
      return { from: new Date(to.getTime() - spanMs), to };
    }
  }
}

function shiftBy(range: DateRange, shift: (date: Date) => Date): { from: Date; to: Date } {
  return { from: startOfDay(shift(range.from)), to: endOfDay(shift(range.to)) };
}

export function parseDateInput(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;

  const text = String(value).trim();
  if (text === "") return null;

  // Excel serial dates arrive as bare numbers.
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 60000) {
      return excelSerialToDate(serial);
    }
  }

  const iso = parseISO(text);
  if (isValid(iso)) return iso;

  // Common human formats: 15/03/2026, 15-03-2026, 03/15/2026
  const match = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (match) {
    const [, a, b, c] = match;
    const year = c.length === 2 ? 2000 + Number(c) : Number(c);
    // Prefer day-first (the convention in PK/UK) unless it cannot be a day.
    const first = Number(a);
    const second = Number(b);
    const dayFirst = first > 12 || second <= 12;
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    const parsed = new Date(year, month - 1, day);
    if (isValid(parsed) && parsed.getMonth() === month - 1) return parsed;
  }

  const loose = new Date(text);
  return isValid(loose) ? loose : null;
}

/** Excel stores dates as days since 1899-12-30 (the 1900 leap-year bug included). */
export function excelSerialToDate(serial: number): Date {
  const utcDays = Math.floor(serial) - 25569;
  const utcSeconds = utcDays * 86400;
  const date = new Date(utcSeconds * 1000);
  const fractionalDay = serial - Math.floor(serial);
  const secondsInDay = Math.round(fractionalDay * 86400);
  date.setUTCSeconds(date.getUTCSeconds() + secondsInDay);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function formatDate(date: Date | string): string {
  const value = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(value)) return "—";
  return format(value, "dd MMM yyyy");
}

export function formatDateShort(date: Date | string): string {
  const value = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(value)) return "—";
  return format(value, "dd MMM");
}

export function formatMonth(date: Date | string): string {
  const value = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(value)) return "—";
  return format(value, "MMM yyyy");
}

export function toInputDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(value)) return "";
  return format(value, "yyyy-MM-dd");
}

export function monthKey(date: Date): string {
  return format(date, "yyyy-MM");
}

/** The buckets a chart should draw for a range: daily if short, monthly if long. */
export function bucketsFor(range: { from: Date; to: Date }): {
  granularity: "day" | "month";
  buckets: { key: string; label: string; start: Date; end: Date }[];
} {
  const spanDays = Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000);

  if (spanDays <= 62) {
    const days = eachDayOfInterval({ start: range.from, end: range.to });
    return {
      granularity: "day",
      buckets: days.map((day) => ({
        key: format(day, "yyyy-MM-dd"),
        label: format(day, "d MMM"),
        start: startOfDay(day),
        end: endOfDay(day),
      })),
    };
  }

  const months = eachMonthOfInterval({ start: range.from, end: range.to });
  return {
    granularity: "month",
    buckets: months.map((month) => ({
      key: format(month, "yyyy-MM"),
      label: format(month, "MMM yy"),
      start: startOfMonth(month),
      end: endOfMonth(month),
    })),
  };
}

export function bucketKeyFor(date: Date, granularity: "day" | "month"): string {
  return granularity === "day" ? format(date, "yyyy-MM-dd") : format(date, "yyyy-MM");
}

/**
 * Always monthly, whatever the span. The P&L's "by month" view needs month
 * columns even for a two-week period, where `bucketsFor` would pick days.
 */
export function monthBucketsFor(range: { from: Date; to: Date }): {
  key: string;
  label: string;
  start: Date;
  end: Date;
}[] {
  return eachMonthOfInterval({ start: range.from, end: range.to }).map((month) => ({
    key: format(month, "yyyy-MM"),
    label: format(month, "MMM yy"),
    // Clamp to the requested window so a partial first or last month is not
    // silently widened into a full one.
    start: month < range.from ? range.from : startOfMonth(month),
    end: endOfMonth(month) > range.to ? range.to : endOfMonth(month),
  }));
}

export { startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay };
