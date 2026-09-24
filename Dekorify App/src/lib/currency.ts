import { toDecimalString, toMajorNumber } from "./money";

export type CurrencyCode = "PKR" | "USD" | "EUR" | "GBP" | "SAR" | "AED";

export interface CurrencyDefinition {
  code: CurrencyCode;
  name: string;
  symbol: string;
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyDefinition> = {
  PKR: { code: "PKR", name: "Pakistani Rupee", symbol: "Rs", locale: "en-PK" },
  USD: { code: "USD", name: "US Dollar", symbol: "$", locale: "en-US" },
  EUR: { code: "EUR", name: "Euro", symbol: "€", locale: "de-DE" },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", locale: "en-GB" },
  SAR: { code: "SAR", name: "Saudi Riyal", symbol: "SAR", locale: "ar-SA" },
  AED: { code: "AED", name: "UAE Dirham", symbol: "AED", locale: "ar-AE" },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return value in CURRENCIES;
}

export function currencyOf(code: string): CurrencyDefinition {
  return CURRENCIES[code as CurrencyCode] ?? CURRENCIES.PKR;
}

/** "PKR 1,500,000" — grouped, no decimals. The default for dashboards. */
export function formatMoney(
  minor: bigint,
  currencyCode: string = "PKR",
  options: { decimals?: boolean; showCode?: boolean; signed?: boolean } = {},
): string {
  const { decimals = false, showCode = true, signed = false } = options;
  const currency = currencyOf(currencyCode);

  const negative = minor < 0n;
  const magnitude = negative ? -minor : minor;

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });

  const body = formatter.format(
    decimals ? Number(toDecimalString(magnitude)) : Math.round(toMajorNumber(magnitude)),
  );

  const prefix = showCode ? `${currency.code} ` : "";
  if (negative) return `(${prefix}${body})`;
  if (signed && minor > 0n) return `+${prefix}${body}`;
  return `${prefix}${body}`;
}

/** Compact form for KPI cards: "PKR 5.0M", "PKR 812K". */
export function formatMoneyCompact(minor: bigint, currencyCode: string = "PKR"): string {
  const currency = currencyOf(currencyCode);
  const negative = minor < 0n;
  const value = Math.abs(toMajorNumber(negative ? -minor : minor));

  let body: string;
  if (value >= 1_000_000_000) body = `${(value / 1_000_000_000).toFixed(2)}B`;
  else if (value >= 1_000_000) body = `${(value / 1_000_000).toFixed(2)}M`;
  else if (value >= 1_000) body = `${(value / 1_000).toFixed(1)}K`;
  else body = value.toFixed(0);

  const text = `${currency.code} ${body}`;
  return negative ? `(${text})` : text;
}

export function formatPercent(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const negative = value < 0;
  const body = `${Math.abs(value).toFixed(decimals)}%`;
  return negative ? `(${body})` : body;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}
