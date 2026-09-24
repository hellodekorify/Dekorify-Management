/**
 * Integer money arithmetic.
 *
 * Every amount in this application is a `bigint` of *minor units* — paisa for
 * PKR, cents for USD. `150000n` is 1,500.00. Floating point is never used for a
 * value that will be stored, summed or compared; `toMajorNumber` exists only to
 * hand a value to a chart or a formatter at the very edge of the app.
 */

/** All supported currencies use two decimal places. */
export const MINOR_UNITS = 2;
export const MINOR_SCALE = 100n;

/** Exchange rates are stored as integers scaled by 1e8. */
export const FX_SCALE = 100_000_000n;
export const FX_IDENTITY = FX_SCALE;

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

/**
 * value * multiplier / divisor, rounded half away from zero.
 * Used for percentages, FX conversion and pro-rata allocation.
 */
export function mulDiv(value: bigint, multiplier: bigint, divisor: bigint): bigint {
  if (divisor === 0n) throw new Error("mulDiv: division by zero");

  const negative = value < 0n !== multiplier < 0n !== divisor < 0n;
  const product = abs(value) * abs(multiplier);
  const d = abs(divisor);

  const quotient = product / d;
  const remainder = product % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;

  return negative ? -rounded : rounded;
}

/** Convert an amount in a foreign currency to the store's base currency. */
export function applyFxRate(amountMinor: bigint, fxRateE8: bigint): bigint {
  if (fxRateE8 === FX_IDENTITY) return amountMinor;
  return mulDiv(amountMinor, fxRateE8, FX_SCALE);
}

/** quantity is a whole number of units; unit cost is minor units. */
export function multiplyByQuantity(unitMinor: bigint, quantity: number): bigint {
  if (!Number.isInteger(quantity)) {
    throw new Error("multiplyByQuantity: quantity must be a whole number");
  }
  return unitMinor * BigInt(quantity);
}

/**
 * Parse user or spreadsheet input into minor units without ever touching a
 * float. Accepts "1,234.56", "PKR 1 234,56", "(500)" for negative, "1.2345"
 * (rounded half-up to 2dp), plain numbers and numeric strings.
 *
 * Returns null when the input is not a usable number, so callers can decide
 * whether that is an error or simply a blank cell.
 */
export function parseMoney(input: unknown): bigint | null {
  if (input === null || input === undefined) return null;

  if (typeof input === "bigint") return input;

  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    // Round-trip through a fixed-precision string so we never inherit binary
    // floating point error from the source value.
    return parseMoney(input.toFixed(MINOR_UNITS + 4));
  }

  let text = String(input).trim();
  if (text === "") return null;

  // Accounting negatives: (1,234.56)
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  // A separator not followed by a digit is punctuation, not part of the number
  // — the full stop in "Rs. 4,500.50" or a trailing "1,234.". Removing these
  // first stops them being mistaken for a decimal point.
  text = text.replace(/[.,](?!\d)/g, "");

  // Drop currency symbols, codes and spaces.
  text = text.replace(/[^\d.,+-]/g, "");
  if (text === "") return null;

  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  text = normaliseSeparators(text);
  if (text === "" || !/^\d*(\.\d*)?$/.test(text)) return null;

  const [wholePart = "", fractionPart = ""] = text.split(".");
  const whole = wholePart === "" ? "0" : wholePart;

  // Take one extra digit so we can round half-up rather than truncate.
  const padded = (fractionPart + "0".repeat(MINOR_UNITS + 1)).slice(0, MINOR_UNITS + 1);
  const keptFraction = padded.slice(0, MINOR_UNITS);
  const nextDigit = Number(padded[MINOR_UNITS] ?? "0");

  let minor = BigInt(whole) * MINOR_SCALE + BigInt(keptFraction);
  if (nextDigit >= 5) minor += 1n;

  return negative ? -minor : minor;
}

/**
 * Decide whether "," and "." are grouping separators or a decimal point.
 * Handles "1,234.56" (en), "1.234,56" (de), "45,000" and "1234.5678".
 *
 * The load-bearing rule: a grouping separator is always followed by exactly
 * three digits. Anything else must be a decimal separator. Getting this wrong
 * turns 45,000 into 45.00, which is why it is spelled out rather than clever.
 */
function normaliseSeparators(text: string): string {
  const commaCount = (text.match(/,/g) ?? []).length;
  const dotCount = (text.match(/\./g) ?? []).length;

  if (commaCount === 0 && dotCount === 0) return text;

  // Both kinds present: the last one is the decimal separator, the other groups.
  if (commaCount > 0 && dotCount > 0) {
    return text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  }

  const separator = commaCount > 0 ? "," : ".";
  const occurrences = commaCount > 0 ? commaCount : dotCount;

  // Repeated separators can only be grouping: 1,234,567 or 1.234.567
  if (occurrences > 1) return text.split(separator).join("");

  const digitsAfter = text.length - text.lastIndexOf(separator) - 1;

  if (digitsAfter === 3) {
    // Ambiguous. A comma here is overwhelmingly grouping ("45,000"); a dot is
    // read as a decimal point, matching the convention these files use.
    return separator === "," ? text.replace(",", "") : text;
  }

  return separator === "," ? text.replace(",", ".") : text;
}

/** Parse and throw a readable error rather than returning null. */
export function requireMoney(input: unknown, fieldName: string): bigint {
  const value = parseMoney(input);
  if (value === null) {
    throw new Error(`${fieldName} is not a valid amount: "${String(input)}"`);
  }
  return value;
}

/** Minor units to a plain decimal string, e.g. 123456n -> "1234.56". */
export function toDecimalString(minor: bigint): string {
  const negative = minor < 0n;
  const value = abs(minor);
  const whole = value / MINOR_SCALE;
  const fraction = (value % MINOR_SCALE).toString().padStart(MINOR_UNITS, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * Minor units to a JS number in *major* units. Display only — never store or
 * re-sum the result. Values here are far below Number.MAX_SAFE_INTEGER for any
 * realistic business, but we guard anyway.
 */
export function toMajorNumber(minor: bigint): number {
  const asNumber = Number(minor);
  if (!Number.isSafeInteger(asNumber)) {
    // Fall back to string parsing; precision beyond 2dp is irrelevant for display.
    return Number(toDecimalString(minor));
  }
  return asNumber / 100;
}

/** Sum a list of minor-unit values. */
export function sumMoney(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

/**
 * Ratio as a percentage, returned as a number for display. Returns null when
 * the denominator is zero so callers can render "—" instead of a fake 0%.
 */
export function percentOf(part: bigint, whole: bigint): number | null {
  if (whole === 0n) return null;
  // Scale by 1e4 first so we keep two decimal places of the percentage.
  const scaled = mulDiv(part, 1_000_000n, whole);
  return Number(scaled) / 10_000;
}

/** Split an amount across n parts pro-rata by weight, losing nothing to rounding. */
export function allocateProRata(amountMinor: bigint, weights: bigint[]): bigint[] {
  const totalWeight = sumMoney(weights);
  if (totalWeight === 0n) {
    // Nothing to weight by: spread evenly and push the remainder onto the first.
    const each = weights.length > 0 ? amountMinor / BigInt(weights.length) : 0n;
    const result = weights.map(() => each);
    if (result.length > 0) {
      result[0] += amountMinor - each * BigInt(weights.length);
    }
    return result;
  }

  const allocated = weights.map((weight) => mulDiv(amountMinor, weight, totalWeight));
  const drift = amountMinor - sumMoney(allocated);
  if (drift !== 0n && allocated.length > 0) {
    // Give the rounding difference to the largest slice.
    let largestIndex = 0;
    for (let i = 1; i < weights.length; i++) {
      if (weights[i] > weights[largestIndex]) largestIndex = i;
    }
    allocated[largestIndex] += drift;
  }
  return allocated;
}

// ---------------------------------------------------------------------------
// FX rate parsing (rates carry more precision than money)
// ---------------------------------------------------------------------------

export function parseFxRate(input: unknown): bigint | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "bigint") return input;

  const text = String(input).trim().replace(/[^\d.,-]/g, "");
  if (text === "") return null;

  const normalised = normaliseSeparators(text.startsWith("-") ? text.slice(1) : text);
  if (!/^\d*(\.\d*)?$/.test(normalised)) return null;

  const [wholePart = "0", fractionPart = ""] = normalised.split(".");
  const padded = (fractionPart + "0".repeat(9)).slice(0, 9);
  const kept = padded.slice(0, 8);
  const nextDigit = Number(padded[8] ?? "0");

  let rate = BigInt(wholePart === "" ? "0" : wholePart) * FX_SCALE + BigInt(kept);
  if (nextDigit >= 5) rate += 1n;

  return rate <= 0n ? null : rate;
}

export function fxRateToNumber(rateE8: bigint): number {
  return Number(rateE8) / Number(FX_SCALE);
}
