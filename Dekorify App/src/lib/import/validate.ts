import { parseDateInput, formatDate } from "../dates";
import { parseMoney, toDecimalString } from "../money";
import { fieldsFor, type ImportField } from "./fields";
import type { ImportTarget } from "../constants";

export type IssueLevel = "error" | "warning";

export interface RowIssue {
  field: string;
  level: IssueLevel;
  message: string;
}

export type RowStatus = "ok" | "warning" | "error" | "duplicate";

export interface ValidatedRow {
  /** 1-based position in the source file, ignoring the header row. */
  sourceRow: number;
  raw: Record<string, string | null>;
  display: Record<string, string>;
  issues: RowIssue[];
  status: RowStatus;
  dedupeKey: string | null;
}

export interface ValidationSummary {
  total: number;
  importable: number;
  clean: number;
  warnings: number;
  errors: number;
  duplicatesInFile: number;
  duplicatesInDatabase: number;
}

export interface ValidationResult {
  rows: ValidatedRow[];
  summary: ValidationSummary;
  unmappedRequired: string[];
}

export interface ValidateOptions {
  target: ImportTarget;
  headers: string[];
  rows: (string | number | boolean | null)[][];
  mapping: Record<string, string>;
  /** Dedupe keys that already exist in the database. */
  existingKeys: Set<string>;
  skipDuplicates: boolean;
}

export function validateRows(options: ValidateOptions): ValidationResult {
  const { target, headers, rows, mapping, existingKeys } = options;
  const fields = fieldsFor(target);

  const columnIndex = new Map(headers.map((header, index) => [header, index]));

  const unmappedRequired = fields
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => field.label);

  const seenInFile = new Set<string>();
  const validated: ValidatedRow[] = [];

  let clean = 0;
  let warnings = 0;
  let errors = 0;
  let duplicatesInFile = 0;
  let duplicatesInDatabase = 0;

  rows.forEach((row, index) => {
    const raw: Record<string, string | null> = {};
    const display: Record<string, string> = {};
    const issues: RowIssue[] = [];

    for (const field of fields) {
      const header = mapping[field.key];
      const value =
        header === undefined ? null : cellToString(row[columnIndex.get(header) ?? -1] ?? null);
      raw[field.key] = value;
      display[field.key] = checkField(field, value, issues);
    }

    const dedupeKey = buildDedupeKey(target, raw);
    let status: RowStatus = "ok";

    if (issues.some((issue) => issue.level === "error")) {
      status = "error";
      errors += 1;
    } else if (dedupeKey && seenInFile.has(dedupeKey)) {
      status = "duplicate";
      duplicatesInFile += 1;
      issues.push({
        field: "_row",
        level: "warning",
        message: "This row repeats an earlier row in the same file.",
      });
    } else if (dedupeKey && existingKeys.has(dedupeKey)) {
      status = "duplicate";
      duplicatesInDatabase += 1;
      issues.push({
        field: "_row",
        level: "warning",
        message: "A matching record already exists in your data.",
      });
    } else if (issues.length > 0) {
      status = "warning";
      warnings += 1;
    } else {
      clean += 1;
    }

    if (dedupeKey) seenInFile.add(dedupeKey);

    validated.push({ sourceRow: index + 1, raw, display, issues, status, dedupeKey });
  });

  const importable = validated.filter((row) =>
    row.status === "error"
      ? false
      : row.status === "duplicate"
        ? !options.skipDuplicates
        : true,
  ).length;

  return {
    rows: validated,
    unmappedRequired,
    summary: {
      total: validated.length,
      importable: unmappedRequired.length > 0 ? 0 : importable,
      clean,
      warnings,
      errors,
      duplicatesInFile,
      duplicatesInDatabase,
    },
  };
}

/** Validates one cell and returns the value as it should be shown in the preview. */
function checkField(field: ImportField, value: string | null, issues: RowIssue[]): string {
  const isBlank = value === null || value.trim() === "";

  if (isBlank) {
    if (field.required) {
      issues.push({
        field: field.key,
        level: "error",
        message: `${field.label} is required but this row is blank.`,
      });
    }
    return "";
  }

  switch (field.type) {
    case "date": {
      const parsed = parseDateInput(value);
      if (!parsed) {
        issues.push({
          field: field.key,
          level: "error",
          message: `"${value}" is not a date this can read.`,
        });
        return value!;
      }
      if (parsed.getFullYear() < 2000 || parsed.getFullYear() > 2100) {
        issues.push({
          field: field.key,
          level: "warning",
          message: `${formatDate(parsed)} looks unlikely — check the date format in your file.`,
        });
      }
      return formatDate(parsed);
    }

    case "money": {
      const parsed = parseMoney(value);
      if (parsed === null) {
        issues.push({
          field: field.key,
          level: "error",
          message: `"${value}" is not a number.`,
        });
        return value!;
      }
      if (parsed < 0n) {
        issues.push({
          field: field.key,
          level: "warning",
          message: `${field.label} is negative. It will be imported as entered.`,
        });
      }
      return toDecimalString(parsed);
    }

    case "number": {
      const cleaned = value!.replace(/[,\s]/g, "");
      const parsed = Number(cleaned);
      if (!Number.isFinite(parsed)) {
        issues.push({
          field: field.key,
          level: "error",
          message: `"${value}" is not a whole number.`,
        });
        return value!;
      }
      if (!Number.isInteger(parsed)) {
        issues.push({
          field: field.key,
          level: "warning",
          message: `${parsed} will be rounded to ${Math.round(parsed)}.`,
        });
      }
      return String(Math.round(parsed));
    }

    case "enum": {
      const matched = matchEnum(value!, field.options ?? []);
      if (!matched) {
        issues.push({
          field: field.key,
          level: "warning",
          message: `"${value}" is not a recognised ${field.label.toLowerCase()}. It will be left blank.`,
        });
        return value!;
      }
      return matched;
    }

    default:
      return value!;
  }
}

/** Matches loosely so "Meta", "facebook ads" and "META" all land on META. */
export function matchEnum(value: string, options: string[]): string | null {
  const cleaned = value.trim().toUpperCase().replace(/[\s-]+/g, "_");

  const direct = options.find((option) => option === cleaned);
  if (direct) return direct;

  const SYNONYMS: Record<string, string> = {
    FACEBOOK: "META",
    FACEBOOK_ADS: "META",
    FB: "META",
    INSTAGRAM: "META",
    META_ADS: "META",
    GOOGLE_ADS: "GOOGLE",
    ADWORDS: "GOOGLE",
    YOUTUBE: "GOOGLE",
    TIKTOK_ADS: "TIKTOK",
    SNAPCHAT_ADS: "SNAPCHAT",
    SNAP: "SNAPCHAT",
    AMAZON_ADS: "AMAZON",

    DELIVERED: "FULFILLED",
    COMPLETE: "FULFILLED",
    COMPLETED: "FULFILLED",
    SHIPPED: "IN_TRANSIT",
    DISPATCHED: "IN_TRANSIT",
    IN_TRANSIT: "IN_TRANSIT",
    RTO: "RETURNED",
    RETURN: "RETURNED",
    RETURNED_TO_ORIGIN: "RETURNED",
    CANCEL: "CANCELLED",
    CANCELED: "CANCELLED",
    VOID: "CANCELLED",
    UNFULFILLED: "UNFULFILLED",
    PENDING: "PENDING",

    PAID: "PAID",
    PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
    PARTIAL_REFUND: "PARTIALLY_REFUNDED",
    REFUNDED: "REFUNDED",
  };

  const synonym = SYNONYMS[cleaned];
  if (synonym && options.includes(synonym)) return synonym;

  const partial = options.find(
    (option) => cleaned.includes(option) || option.includes(cleaned),
  );
  return partial ?? null;
}

/**
 * The natural key for a record. Two rows sharing one are the same transaction,
 * which is how re-importing last month's export avoids doubling the numbers.
 */
export function buildDedupeKey(
  target: ImportTarget,
  raw: Record<string, string | null>,
): string | null {
  const norm = (value: string | null | undefined) =>
    (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

  const money = (value: string | null | undefined) => {
    const parsed = parseMoney(value ?? "");
    return parsed === null ? "" : parsed.toString();
  };

  const day = (value: string | null | undefined) => {
    const parsed = parseDateInput(value ?? "");
    return parsed ? parsed.toISOString().slice(0, 10) : "";
  };

  switch (target) {
    case "SALE":
      return norm(raw.orderId) ? `sale|${norm(raw.orderId)}` : null;
    case "EXPENSE":
      return `expense|${day(raw.date)}|${norm(raw.name)}|${money(raw.amount)}`;
    case "COGS":
      return `cogs|${day(raw.date)}|${norm(raw.sku || raw.productName)}|${norm(raw.quantity)}|${money(raw.unitCost)}`;
    case "AD_SPEND":
      return `ad|${day(raw.date)}|${norm(raw.platform)}|${norm(raw.campaignName)}|${money(raw.amount)}`;
    case "PRODUCT":
      return norm(raw.sku) ? `product|sku|${norm(raw.sku)}` : `product|name|${norm(raw.name)}`;
    case "SUPPLIER":
      return `supplier|${norm(raw.name)}`;
    default:
      return null;
  }
}

function cellToString(value: string | number | boolean | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  return String(value);
}
