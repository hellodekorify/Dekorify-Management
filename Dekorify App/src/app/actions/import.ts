"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { recordAudit, safeStringify } from "@/lib/audit";
import { readStoredFile, storeImportFile } from "@/lib/storage";
import { parseWorkbook, type ParsedSheet } from "@/lib/import/parse";
import { autoMap, fieldsFor } from "@/lib/import/fields";
import { executeImport, loadExistingKeys } from "@/lib/import/execute";
import { validateRows, type ValidatedRow, type ValidationSummary } from "@/lib/import/validate";
import type { ImportTarget } from "@/lib/constants";

const PREVIEW_ROWS = 100;

// ---------------------------------------------------------------------------
// Step 1 â€” upload and inspect
// ---------------------------------------------------------------------------

export interface SheetSummary {
  name: string;
  headers: string[];
  rowCount: number;
  previewRows: (string | number | boolean | null)[][];
}

export type UploadResult =
  | {
      ok: true;
      batchId: string;
      fileName: string;
      format: string;
      sheets: SheetSummary[];
      suggestedTarget: ImportTarget;
      alreadyImported: { fileName: string; when: string; rows: number } | null;
    }
  | { ok: false; message: string };

export async function uploadImportFileAction(formData: FormData): Promise<UploadResult> {
  const { user, store } = await requireContext();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }

  let stored;
  try {
    stored = await storeImportFile(file, store.id);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }

  let workbook;
  try {
    const buffer = await readStoredFile(stored.relativePath);
    workbook = parseWorkbook(buffer, stored.fileName);
  } catch (error) {
    return {
      ok: false,
      message: `That file could not be read. ${(error as Error).message}`,
    };
  }

  if (workbook.sheets.length === 0) {
    return {
      ok: false,
      message:
        "No table was found in that file. Check that the first row contains column headings.",
    };
  }

  // Re-uploading the same report is common; say so rather than silently doubling.
  const previous = await prisma.importBatch.findFirst({
    where: { storeId: store.id, fileHash: stored.hash, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
  });

  const batch = await prisma.importBatch.create({
    data: {
      storeId: store.id,
      userId: user.id,
      fileName: stored.fileName,
      fileSize: stored.size,
      fileHash: stored.hash,
      storedPath: stored.relativePath,
      targetEntity: "",
      columnMapping: "{}",
      status: "PENDING",
      totalRows: workbook.sheets[0].rows.length,
    },
  });

  return {
    ok: true,
    batchId: batch.id,
    fileName: stored.fileName,
    format: workbook.format,
    suggestedTarget: guessTarget(workbook.sheets[0]),
    sheets: workbook.sheets.map((sheet) => ({
      name: sheet.name,
      headers: sheet.headers,
      rowCount: sheet.rows.length,
      previewRows: sheet.rows.slice(0, 5),
    })),
    alreadyImported: previous
      ? {
          fileName: previous.fileName,
          when: previous.createdAt.toISOString(),
          rows: previous.importedRows,
        }
      : null,
  };
}

/** Guesses what a sheet holds from its column headings. */
function guessTarget(sheet: ParsedSheet): ImportTarget {
  const headers = sheet.headers.map((header) =>
    header.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  const has = (...needles: string[]) =>
    needles.some((needle) => headers.some((header) => header.includes(needle)));

  if (has("amountspent", "impressions", "adset", "campaign")) return "AD_SPEND";
  if (has("orderid", "ordernumber", "lineitem", "fulfillment", "financialstatus")) return "SALE";
  if (has("unitcost", "costprice", "purchaseprice", "landedcost")) return "COGS";
  if (has("expensecategory", "expensehead", "payee", "paidto")) return "EXPENSE";
  if (has("sellingprice", "retailprice", "inventory", "stock")) return "PRODUCT";
  if (has("contactperson", "suppliername", "vendorname")) return "SUPPLIER";
  if (has("category", "vendor", "particulars")) return "EXPENSE";
  return "SALE";
}

export async function suggestMappingAction(
  batchId: string,
  sheetName: string,
  target: ImportTarget,
): Promise<Record<string, string>> {
  const sheet = await loadSheet(batchId, sheetName);
  return sheet ? autoMap(target, sheet.headers) : {};
}

// ---------------------------------------------------------------------------
// Step 2 â€” validate against the chosen mapping
// ---------------------------------------------------------------------------

export interface PreviewResult {
  ok: boolean;
  message?: string;
  summary: ValidationSummary;
  unmappedRequired: string[];
  rows: ValidatedRow[];
  truncated: boolean;
}

export async function previewImportAction(
  batchId: string,
  sheetName: string,
  target: ImportTarget,
  mapping: Record<string, string>,
  skipDuplicates: boolean,
): Promise<PreviewResult> {
  const { store } = await requireContext();

  const sheet = await loadSheet(batchId, sheetName);
  if (!sheet) {
    return {
      ok: false,
      message: "That upload could not be found. Please upload the file again.",
      summary: emptySummary(),
      unmappedRequired: [],
      rows: [],
      truncated: false,
    };
  }

  const existingKeys = await loadExistingKeys(store.id, target);

  const result = validateRows({
    target,
    headers: sheet.headers,
    rows: sheet.rows,
    mapping,
    existingKeys,
    skipDuplicates,
  });

  return {
    ok: true,
    summary: result.summary,
    unmappedRequired: result.unmappedRequired,
    rows: result.rows.slice(0, PREVIEW_ROWS),
    truncated: result.rows.length > PREVIEW_ROWS,
  };
}

// ---------------------------------------------------------------------------
// Step 3 â€” import
// ---------------------------------------------------------------------------

export interface ImportResult {
  ok: boolean;
  message: string;
  imported: number;
  skipped: number;
  failed: number;
}

export async function confirmImportAction(
  batchId: string,
  sheetName: string,
  target: ImportTarget,
  mapping: Record<string, string>,
  skipDuplicates: boolean,
): Promise<ImportResult> {
  const { user, store } = await requireContext();

  const batch = await prisma.importBatch.findFirst({ where: { id: batchId, storeId: store.id } });
  if (!batch) {
    return { ok: false, message: "That upload could not be found.", imported: 0, skipped: 0, failed: 0 };
  }
  if (batch.status === "COMPLETED") {
    return {
      ok: false,
      message: "This file has already been imported. Upload it again if you need to re-import.",
      imported: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const sheet = await loadSheet(batchId, sheetName);
  if (!sheet) {
    return { ok: false, message: "The uploaded file could not be re-read.", imported: 0, skipped: 0, failed: 0 };
  }

  const existingKeys = await loadExistingKeys(store.id, target);
  const validation = validateRows({
    target,
    headers: sheet.headers,
    rows: sheet.rows,
    mapping,
    existingKeys,
    skipDuplicates,
  });

  if (validation.unmappedRequired.length > 0) {
    return {
      ok: false,
      message: `Map every required column first: ${validation.unmappedRequired.join(", ")}.`,
      imported: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const toImport = validation.rows.filter(
    (row) => row.status !== "error" && !(skipDuplicates && row.status === "duplicate"),
  );
  const skipped = validation.rows.length - toImport.length;

  if (toImport.length === 0) {
    return {
      ok: false,
      message: "There is nothing to import â€” every row was either invalid or a duplicate.",
      imported: 0,
      skipped,
      failed: validation.summary.errors,
    };
  }

  let imported = 0;

  try {
    // One transaction: either the whole file lands or none of it does.
    imported = await executeImport({
      storeId: store.id,
      batchId: batch.id,
      target,
      rows: toImport,
      baseCurrency: store.baseCurrency,
    });

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        targetEntity: target,
        sheetName,
        columnMapping: safeStringify(mapping),
        status: "COMPLETED",
        totalRows: validation.rows.length,
        importedRows: imported,
        skippedRows: skipped,
        errorRows: validation.summary.errors,
        completedAt: new Date(),
      },
    });

    // A sample of rows is kept so a bad import can be traced back.
    await prisma.importRecord.createMany({
      data: validation.rows.slice(0, 500).map((row) => ({
        batchId: batch.id,
        rowIndex: row.sourceRow,
        rawData: safeStringify(row.raw),
        status:
          row.status === "error"
            ? "ERROR"
            : row.status === "duplicate" && skipDuplicates
              ? "SKIPPED_DUPLICATE"
              : "IMPORTED",
        message: row.issues[0]?.message ?? null,
      })),
    });
  } catch (error) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", errorMessage: (error as Error).message },
    });
    return {
      ok: false,
      message: `The import was rolled back and nothing was saved. ${(error as Error).message}`,
      imported: 0,
      skipped: 0,
      failed: 0,
    };
  }

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "ImportBatch",
    entityId: batch.id,
    action: "IMPORT",
    summary: `Imported ${imported} ${target} record${imported === 1 ? "" : "s"} from ${batch.fileName}`,
  });

  revalidatePath("/import");
  revalidatePath("/");
  revalidatePath(`/${target === "AD_SPEND" ? "ads" : target.toLowerCase()}s`);

  return {
    ok: true,
    imported,
    skipped,
    failed: validation.summary.errors,
    message: `Imported ${imported} record${imported === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadSheet(batchId: string, sheetName: string): Promise<ParsedSheet | null> {
  const { store } = await requireContext();

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, storeId: store.id },
  });
  if (!batch?.storedPath) return null;

  try {
    const buffer = await readStoredFile(batch.storedPath);
    const workbook = parseWorkbook(buffer, batch.fileName);
    return workbook.sheets.find((sheet) => sheet.name === sheetName) ?? workbook.sheets[0] ?? null;
  } catch {
    return null;
  }
}


function emptySummary(): ValidationSummary {
  return {
    total: 0,
    importable: 0,
    clean: 0,
    warnings: 0,
    errors: 0,
    duplicatesInFile: 0,
    duplicatesInDatabase: 0,
  };
}

export async function getImportFieldsAction(target: ImportTarget) {
  return fieldsFor(target);
}
