import * as XLSX from "xlsx";
import Papa from "papaparse";

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: (string | number | boolean | null)[][];
  /** Index of the row the headers were taken from, for reporting. */
  headerRowIndex: number;
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  format: "xlsx" | "xls" | "csv";
}

const MAX_ROWS = 50_000;

export function parseWorkbook(buffer: Buffer, fileName: string): ParsedWorkbook {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";

  if (extension === "csv" || extension === "tsv" || extension === "txt") {
    return { sheets: [parseDelimited(buffer, extension)], format: "csv" };
  }

  // cellDates keeps real dates as Date objects rather than Excel serial numbers.
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellNF: false });

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const grid = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    return buildSheet(name, grid.slice(0, MAX_ROWS + 20));
  }).filter((sheet) => sheet.headers.length > 0);

  return { sheets, format: extension === "xls" ? "xls" : "xlsx" };
}

function parseDelimited(buffer: Buffer, extension: string): ParsedSheet {
  const text = stripBom(buffer.toString("utf8"));

  const result = Papa.parse<(string | null)[]>(text, {
    delimiter: extension === "tsv" ? "\t" : "",
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  return buildSheet("Sheet1", result.data.slice(0, MAX_ROWS + 20));
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Real exports rarely start on row 1 — there is often a title, a blank line or
 * a filter summary above the actual table. The header row is taken to be the
 * first row with at least two filled cells that also has data beneath it.
 */
function buildSheet(
  name: string,
  grid: (string | number | boolean | Date | null)[][],
): ParsedSheet {
  let headerRowIndex = -1;

  for (let index = 0; index < Math.min(grid.length, 25); index++) {
    const row = grid[index] ?? [];
    const filled = row.filter((cell) => cell !== null && String(cell).trim() !== "").length;
    const hasBody = grid
      .slice(index + 1, index + 4)
      .some((next) => (next ?? []).some((cell) => cell !== null && String(cell).trim() !== ""));

    if (filled >= 2 && hasBody) {
      headerRowIndex = index;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return { name, headers: [], rows: [], headerRowIndex: 0 };
  }

  const headers = normaliseHeaders(grid[headerRowIndex] ?? []);
  const rows = grid
    .slice(headerRowIndex + 1, headerRowIndex + 1 + MAX_ROWS)
    .map((row) => headers.map((_, column) => toCell(row?.[column] ?? null)))
    .filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""));

  return { name, headers, rows, headerRowIndex };
}

/** Blank and duplicate headers get stable names so mapping stays unambiguous. */
function normaliseHeaders(row: (string | number | boolean | Date | null)[]): string[] {
  const seen = new Map<string, number>();

  // Trailing empty columns are noise; drop them before naming.
  let lastFilled = -1;
  row.forEach((cell, index) => {
    if (cell !== null && String(cell).trim() !== "") lastFilled = index;
  });

  return row.slice(0, lastFilled + 1).map((cell, index) => {
    const base =
      cell === null || String(cell).trim() === ""
        ? `Column ${columnLetter(index)}`
        : String(cell).trim().replace(/\s+/g, " ");

    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function columnLetter(index: number): string {
  let letter = "";
  let value = index;
  while (value >= 0) {
    letter = String.fromCharCode((value % 26) + 65) + letter;
    value = Math.floor(value / 26) - 1;
  }
  return letter;
}

/** Dates are kept as ISO strings so they survive the trip to the browser. */
function toCell(value: string | number | boolean | Date | null): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
}
