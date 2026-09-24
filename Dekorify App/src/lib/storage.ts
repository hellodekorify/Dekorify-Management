import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR ?? "./storage");

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const ALLOWED_RECEIPT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
]);

const ALLOWED_IMPORT_EXTENSIONS = new Set([".csv", ".xlsx", ".xls", ".tsv", ".txt"]);

export interface StoredFile {
  relativePath: string;
  fileName: string;
  size: number;
  hash: string;
}

/**
 * Files are written under storage/<storeId>/<kind>/ with a generated name.
 * The user's original filename is kept in the database for display only — it
 * never reaches the filesystem, so a crafted name cannot escape the directory.
 */
async function store(
  file: File,
  storeId: string,
  kind: "receipts" | "imports",
): Promise<StoredFile> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const directory = path.join(STORAGE_ROOT, storeId, kind);
  await mkdir(directory, { recursive: true });

  const extension = safeExtension(file.name);
  const generatedName = `${Date.now()}-${randomBytes(6).toString("hex")}${extension}`;
  await writeFile(path.join(directory, generatedName), buffer);

  return {
    relativePath: path.posix.join(storeId, kind, generatedName),
    fileName: file.name.slice(0, 255),
    size: buffer.length,
    hash: createHash("md5").update(buffer).digest("hex"),
  };
}

export async function storeReceipt(file: File, storeId: string): Promise<StoredFile> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("That receipt is larger than 20 MB. Please attach a smaller file.");
  }
  if (file.type && !ALLOWED_RECEIPT_TYPES.has(file.type)) {
    throw new Error("Receipts must be a PDF or an image (PNG, JPEG, WebP).");
  }
  return store(file, storeId, "receipts");
}

export async function storeImportFile(file: File, storeId: string): Promise<StoredFile> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("That file is larger than 20 MB. Please split it and import in parts.");
  }
  if (!ALLOWED_IMPORT_EXTENSIONS.has(safeExtension(file.name))) {
    throw new Error("Only .xlsx, .xls and .csv files can be imported.");
  }
  return store(file, storeId, "imports");
}

/** Reads a stored file back, refusing any path that escapes the storage root. */
export async function readStoredFile(relativePath: string): Promise<Buffer> {
  const resolved = path.resolve(STORAGE_ROOT, relativePath);
  const root = path.resolve(STORAGE_ROOT);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Refusing to read a file outside the storage directory.");
  }

  return readFile(resolved);
}

function safeExtension(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : "";
}

export function contentTypeFor(fileName: string): string {
  switch (safeExtension(fileName)) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".csv":
      return "text/csv";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".xls":
      return "application/vnd.ms-excel";
    default:
      return "application/octet-stream";
  }
}
