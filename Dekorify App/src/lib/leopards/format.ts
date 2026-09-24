/**
 * Presentation helpers for Leopards data.
 *
 * The rule throughout: where Leopards supplied nothing, say so in words rather
 * than printing an em dash that could be mistaken for a real value, and never
 * substitute a default.
 */

export const NOT_PROVIDED = "Not provided by Leopards";

/** Leopards reports Pakistan local time, so that is how it is shown. */
const PKT = "Asia/Karachi";

export function formatPkt(value: Date | string | null | undefined): string {
  if (!value) return NOT_PROVIDED;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return NOT_PROVIDED;

  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: PKT,
  }).format(date)} PKT`;
}

export function formatPktShort(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: PKT,
  }).format(date);
}

/** "3 minutes ago", for the last-synchronised line. */
export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "never";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";

  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [2592000, "day"],
  ];

  const formatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  if (seconds < 60) return formatter.format(-seconds, "second");
  if (seconds < 3600) return formatter.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86400) return formatter.format(-Math.round(seconds / 3600), "hour");
  void units;
  return formatter.format(-Math.round(seconds / 86400), "day");
}

/** Text Leopards did not supply, rendered as an explicit absence. */
export function orNotProvided(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : NOT_PROVIDED;
}

/**
 * Leopards states COD as a plain decimal string with no currency. It is shown
 * with PKR because Leopards is a Pakistani carrier billing in rupees, and the
 * number itself is reproduced exactly as given rather than reformatted.
 */
export function formatCod(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) return NOT_PROVIDED;
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount)) return text;
  return `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(amount)}`;
}

export function formatWeight(grams: number | null | undefined): string {
  if (grams === null || grams === undefined) return NOT_PROVIDED;
  if (grams >= 1000) return `${(grams / 1000).toFixed(2)} kg`;
  return `${grams} g`;
}
