"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Info,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import {
  confirmImportAction,
  previewImportAction,
  suggestMappingAction,
  uploadImportFileAction,
  type PreviewResult,
  type SheetSummary,
} from "@/app/actions/import";
import { fieldsFor, type ImportField } from "@/lib/import/fields";
import { IMPORT_TARGETS, type ImportTarget } from "@/lib/constants";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";

type Step = "upload" | "target" | "map" | "preview" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "target", label: "Choose data" },
  { id: "map", label: "Map columns" },
  { id: "preview", label: "Check & import" },
];

interface UploadState {
  batchId: string;
  fileName: string;
  format: string;
  sheets: SheetSummary[];
  alreadyImported: { fileName: string; when: string; rows: number } | null;
}

export function ImportWizard() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("upload");
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [target, setTarget] = useState<ImportTarget>("SALE");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number; failed: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const sheet = upload?.sheets.find((item) => item.name === sheetName) ?? upload?.sheets[0];
  const fields = fieldsFor(target);

  function reset() {
    setStep("upload");
    setUpload(null);
    setSheetName("");
    setMapping({});
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function handleFile(file: File) {
    setError(null);
    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const response = await uploadImportFileAction(formData);
      if (!response.ok) {
        setError(response.message);
        return;
      }

      setUpload({
        batchId: response.batchId,
        fileName: response.fileName,
        format: response.format,
        sheets: response.sheets,
        alreadyImported: response.alreadyImported,
      });
      setSheetName(response.sheets[0].name);
      setTarget(response.suggestedTarget);
      setStep("target");
    });
  }

  function goToMapping() {
    if (!upload || !sheet) return;
    setError(null);
    startTransition(async () => {
      const suggested = await suggestMappingAction(upload.batchId, sheet.name, target);
      setMapping(suggested);
      setStep("map");
    });
  }

  function goToPreview() {
    if (!upload || !sheet) return;
    setError(null);
    startTransition(async () => {
      const response = await previewImportAction(
        upload.batchId,
        sheet.name,
        target,
        mapping,
        skipDuplicates,
      );
      if (!response.ok) {
        setError(response.message ?? "Something went wrong reading that file.");
        return;
      }
      setPreview(response);
      setStep("preview");
    });
  }

  function refreshPreview(nextSkip: boolean) {
    if (!upload || !sheet) return;
    setSkipDuplicates(nextSkip);
    startTransition(async () => {
      const response = await previewImportAction(
        upload.batchId,
        sheet.name,
        target,
        mapping,
        nextSkip,
      );
      if (response.ok) setPreview(response);
    });
  }

  function runImport() {
    if (!upload || !sheet) return;
    setError(null);
    startTransition(async () => {
      const response = await confirmImportAction(
        upload.batchId,
        sheet.name,
        target,
        mapping,
        skipDuplicates,
      );
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setResult({
        imported: response.imported,
        skipped: response.skipped,
        failed: response.failed,
      });
      setStep("done");
      toast({
        title: "Import complete",
        description: response.message,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Stepper current={step} />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-negative-border bg-negative-soft p-4"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] leading-relaxed text-negative">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="-m-1 shrink-0 rounded p-1 text-negative/70 hover:text-negative"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {step === "upload" && <UploadStep onFile={handleFile} busy={busy} />}

      {step === "target" && upload && sheet && (
        <TargetStep
          upload={upload}
          sheet={sheet}
          sheetName={sheetName}
          onSheetChange={setSheetName}
          target={target}
          onTargetChange={setTarget}
          onBack={reset}
          onNext={goToMapping}
          busy={busy}
        />
      )}

      {step === "map" && upload && sheet && (
        <MapStep
          sheet={sheet}
          fields={fields}
          mapping={mapping}
          onChange={setMapping}
          onBack={() => setStep("target")}
          onNext={goToPreview}
          busy={busy}
        />
      )}

      {step === "preview" && preview && sheet && (
        <PreviewStep
          preview={preview}
          fields={fields}
          skipDuplicates={skipDuplicates}
          onSkipChange={refreshPreview}
          onBack={() => setStep("map")}
          onImport={runImport}
          busy={busy}
        />
      )}

      {step === "done" && result && (
        <DoneStep result={result} target={target} onAnother={reset} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stepper({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);
  const activeIndex = current === "done" ? STEPS.length : currentIndex;

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {STEPS.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;

        return (
          <li key={step.id} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold",
                done && "bg-positive text-white",
                active && "bg-brand text-white",
                !done && !active && "bg-surface-muted text-muted",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
            </span>
            <span
              className={cn(
                "text-[13px] font-medium",
                active ? "text-foreground" : done ? "text-muted-strong" : "text-subtle",
              )}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && (
              <span className="mx-1 h-px w-6 bg-border-subtle sm:w-10" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function UploadStep({ onFile, busy }: { onFile: (file: File) => void; busy: boolean }) {
  const [dragging, setDragging] = useState(false);

  return (
    <Card>
      <CardBody>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) onFile(file);
          }}
          className={cn(
            "flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
            dragging ? "border-brand bg-brand-soft" : "border-border-strong bg-surface-muted",
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden />
              <p className="mt-4 text-[14px] font-medium">Reading your file…</p>
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-surface p-3.5" style={{ boxShadow: "var(--shadow-sm)" }}>
                <Upload className="h-6 w-6 text-brand" aria-hidden />
              </div>
              <p className="mt-4 text-[15px] font-semibold text-foreground">
                Drop your spreadsheet here
              </p>
              <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
                Excel (.xlsx, .xls) or CSV, up to 20 MB. Nothing is saved until you have checked
                the preview and confirmed.
              </p>

              <label className="mt-5">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onFile(file);
                    event.target.value = "";
                  }}
                />
                <span className="inline-flex h-9.5 cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-hover">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden />
                  Choose a file
                </span>
              </label>
            </>
          )}
        </div>

        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              title: "Columns are matched for you",
              body: "Common headings from Shopify, Meta and bank exports are recognised automatically.",
            },
            {
              title: "Every row is checked first",
              body: "Bad dates, non-numeric amounts, blanks and duplicates are all flagged before import.",
            },
            {
              title: "All or nothing",
              body: "The import runs in a single transaction, so a failure part-way leaves your data untouched.",
            },
          ].map((item) => (
            <li key={item.title} className="rounded-lg border border-border-subtle p-3">
              <p className="text-[13px] font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function TargetStep({
  upload,
  sheet,
  sheetName,
  onSheetChange,
  target,
  onTargetChange,
  onBack,
  onNext,
  busy,
}: {
  upload: UploadState;
  sheet: SheetSummary;
  sheetName: string;
  onSheetChange: (value: string) => void;
  target: ImportTarget;
  onTargetChange: (value: ImportTarget) => void;
  onBack: () => void;
  onNext: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-positive-soft">
            <FileSpreadsheet className="h-5 w-5 text-positive" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-foreground">{upload.fileName}</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {upload.format.toUpperCase()} · {sheet.rowCount.toLocaleString()} rows ·{" "}
              {sheet.headers.length} columns
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            Choose a different file
          </Button>
        </CardBody>
      </Card>

      {upload.alreadyImported && (
        <div className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-soft p-4">
          <Copy className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="text-[13.5px] font-semibold text-warning">
              You have imported this exact file before
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-warning">
              On {formatDate(upload.alreadyImported.when)} it added{" "}
              {upload.alreadyImported.rows.toLocaleString()} records. You can continue — matching
              rows will be flagged as duplicates in the preview.
            </p>
          </div>
        </div>
      )}

      {upload.sheets.length > 1 && (
        <Card>
          <CardHeader
            title="Which sheet?"
            description="This workbook has more than one sheet of data."
          />
          <CardBody>
            <Select
              value={sheetName}
              onChange={(event) => onSheetChange(event.target.value)}
              aria-label="Sheet"
              options={upload.sheets.map((item) => ({
                value: item.name,
                label: `${item.name} — ${item.rowCount.toLocaleString()} rows, ${item.headers.length} columns`,
              }))}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="What is in this file?"
          description="We have made a guess from the column headings — change it if that is wrong."
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_TARGETS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onTargetChange(option.value)}
                aria-pressed={target === option.value}
                className={cn(
                  "rounded-xl border p-3.5 text-left transition-colors",
                  target === option.value
                    ? "border-brand bg-brand-soft ring-1 ring-brand"
                    : "border-border-subtle hover:border-border-strong hover:bg-surface-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "text-[14px] font-semibold",
                      target === option.value ? "text-brand" : "text-foreground",
                    )}
                  >
                    {option.label}
                  </p>
                  {target === option.value && (
                    <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                  )}
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  {option.description}
                </p>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="First few rows" description="A quick look at what was read." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-[12.5px]">
            <thead className="border-b border-border-subtle bg-surface-muted">
              <tr>
                {sheet.headers.map((header) => (
                  <th
                    key={header}
                    className="px-3 py-2 text-left font-semibold whitespace-nowrap text-muted-strong"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.previewRows.map((row, index) => (
                <tr key={index} className="border-b border-border-subtle last:border-0">
                  {sheet.headers.map((_, column) => (
                    <td key={column} className="px-3 py-1.5 whitespace-nowrap text-muted-strong">
                      {formatCell(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Button>
        <Button onClick={onNext} loading={busy}>
          Map the columns
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function MapStep({
  sheet,
  fields,
  mapping,
  onChange,
  onBack,
  onNext,
  busy,
}: {
  sheet: SheetSummary;
  fields: ImportField[];
  mapping: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
  onBack: () => void;
  onNext: () => void;
  busy: boolean;
}) {
  const missingRequired = fields.filter((field) => field.required && !mapping[field.key]);

  function setField(fieldKey: string, column: string) {
    const next = { ...mapping };
    if (column === "") delete next[fieldKey];
    else next[fieldKey] = column;
    onChange(next);
  }

  const usedColumns = new Set(Object.values(mapping));
  const unusedColumns = sheet.headers.filter((header) => !usedColumns.has(header));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Match your columns"
          description="Each row below is a field in the app. Choose which column from your file feeds it."
          action={
            <Badge tone={missingRequired.length === 0 ? "positive" : "warning"}>
              {Object.keys(mapping).length} of {fields.length} mapped
            </Badge>
          }
        />

        <div className="divide-y divide-border-subtle">
          {fields.map((field) => {
            const column = mapping[field.key] ?? "";
            const columnIndex = sheet.headers.indexOf(column);
            const sample =
              columnIndex >= 0
                ? sheet.previewRows
                    .map((row) => row[columnIndex])
                    .find((value) => value !== null && String(value).trim() !== "")
                : null;

            return (
              <div
                key={field.key}
                className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-foreground">
                    {field.label}
                    {field.required && <span className="ml-0.5 text-negative">*</span>}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {field.hint ?? typeHint(field.type)}
                  </p>
                </div>

                <Select
                  value={column}
                  onChange={(event) => setField(field.key, event.target.value)}
                  aria-label={`Column for ${field.label}`}
                  placeholder={field.required ? "Choose a column…" : "Not imported"}
                  className={cn(
                    field.required && !column && "border-negative bg-negative-soft",
                  )}
                  options={sheet.headers.map((header) => ({
                    value: header,
                    label: header,
                  }))}
                />

                <p className="min-w-0 truncate text-[12.5px] text-muted">
                  {column ? (
                    sample !== null && sample !== undefined ? (
                      <>
                        <span className="text-subtle">e.g. </span>
                        <span className="font-medium text-muted-strong">{formatCell(sample)}</span>
                      </>
                    ) : (
                      <span className="text-subtle">Column is empty in the first rows</span>
                    )
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {missingRequired.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-negative-border bg-negative-soft p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" aria-hidden />
          <p className="text-[13px] leading-relaxed text-negative">
            Still to map:{" "}
            <span className="font-semibold">
              {missingRequired.map((field) => field.label).join(", ")}
            </span>
            . These are needed before anything can be imported.
          </p>
        </div>
      )}

      {unusedColumns.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-info-border bg-info-soft p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden />
          <p className="text-[13px] leading-relaxed text-info">
            {unusedColumns.length} column{unusedColumns.length === 1 ? "" : "s"} in your file
            {unusedColumns.length === 1 ? " is" : " are"} not being imported:{" "}
            <span className="font-medium">{unusedColumns.slice(0, 8).join(", ")}</span>
            {unusedColumns.length > 8 && ` and ${unusedColumns.length - 8} more`}.
          </p>
        </div>
      )}

      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Button>
        <Button onClick={onNext} loading={busy} disabled={missingRequired.length > 0}>
          Check the data
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function PreviewStep({
  preview,
  fields,
  skipDuplicates,
  onSkipChange,
  onBack,
  onImport,
  busy,
}: {
  preview: PreviewResult;
  fields: ImportField[];
  skipDuplicates: boolean;
  onSkipChange: (value: boolean) => void;
  onBack: () => void;
  onImport: () => void;
  busy: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "problems">("all");
  const { summary } = preview;

  const mappedFields = fields.filter((field) =>
    preview.rows.some((row) => row.display[field.key] !== ""),
  );
  const columns = mappedFields.length > 0 ? mappedFields.slice(0, 7) : fields.slice(0, 7);

  const visibleRows =
    filter === "problems"
      ? preview.rows.filter((row) => row.status !== "ok")
      : preview.rows;

  const duplicatesTotal = summary.duplicatesInFile + summary.duplicatesInDatabase;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatChip label="Rows in file" value={summary.total} tone="neutral" />
        <StatChip label="Will be imported" value={summary.importable} tone="positive" />
        <StatChip label="Duplicates" value={duplicatesTotal} tone={duplicatesTotal ? "warning" : "neutral"} />
        <StatChip label="Rows with errors" value={summary.errors} tone={summary.errors ? "negative" : "neutral"} />
      </div>

      {duplicatesTotal > 0 && (
        <Card>
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Copy className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
              <div>
                <p className="text-[13.5px] font-semibold text-foreground">
                  {duplicatesTotal} duplicate row{duplicatesTotal === 1 ? "" : "s"} found
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                  {summary.duplicatesInDatabase > 0 &&
                    `${summary.duplicatesInDatabase} already exist in your data`}
                  {summary.duplicatesInDatabase > 0 && summary.duplicatesInFile > 0 && "; "}
                  {summary.duplicatesInFile > 0 &&
                    `${summary.duplicatesInFile} repeat within the file itself`}
                  .
                </p>
              </div>
            </div>
            <Checkbox
              label="Skip duplicates"
              hint="Recommended — importing them would double those figures."
              checked={skipDuplicates}
              onChange={(event) => onSkipChange(event.target.checked)}
              className="shrink-0 sm:max-w-xs"
            />
          </CardBody>
        </Card>
      )}

      {summary.errors > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-negative-border bg-negative-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-negative" aria-hidden />
          <p className="text-[13px] leading-relaxed text-negative">
            {summary.errors} row{summary.errors === 1 ? "" : "s"} cannot be imported because a
            required value is missing or unreadable. {summary.errors === 1 ? "It" : "They"} will be
            left out; the rest will import normally. Fix them in your file and import again if you
            need them.
          </p>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title="Preview"
          description={
            preview.truncated
              ? `Showing the first ${preview.rows.length} rows of ${summary.total.toLocaleString()}. All rows are checked, not just these.`
              : `All ${summary.total.toLocaleString()} rows as they will be imported.`
          }
          action={
            <div className="flex rounded-lg border border-border-strong p-0.5">
              {(["all", "problems"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors",
                    filter === value
                      ? "bg-brand text-white"
                      : "text-muted-strong hover:text-foreground",
                  )}
                >
                  {value === "all" ? "All rows" : `Problems (${summary.total - summary.clean})`}
                </button>
              ))}
            </div>
          }
        />

        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-max border-collapse text-[12.5px]">
            <thead className="sticky top-0 z-10 border-b border-border-subtle bg-surface-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-muted-strong">Row</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-strong">Status</th>
                {columns.map((field) => (
                  <th
                    key={field.key}
                    className="px-3 py-2 text-left font-semibold whitespace-nowrap text-muted-strong"
                  >
                    {field.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-semibold text-muted-strong">Notes</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 3} className="px-4 py-10 text-center text-muted">
                    No rows to show.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr
                    key={row.sourceRow}
                    className={cn(
                      "border-b border-border-subtle last:border-0",
                      row.status === "error" && "bg-negative-soft/50",
                      row.status === "duplicate" && "bg-warning-soft/50",
                    )}
                  >
                    <td className="px-3 py-1.5 tabular text-muted">{row.sourceRow}</td>
                    <td className="px-3 py-1.5">
                      <RowStatusBadge status={row.status} skipped={skipDuplicates} />
                    </td>
                    {columns.map((field) => {
                      const hasIssue = row.issues.some((issue) => issue.field === field.key);
                      return (
                        <td
                          key={field.key}
                          className={cn(
                            "max-w-[220px] truncate px-3 py-1.5 whitespace-nowrap",
                            hasIssue ? "font-medium text-negative" : "text-muted-strong",
                          )}
                        >
                          {row.display[field.key] || <span className="text-subtle">—</span>}
                        </td>
                      );
                    })}
                    <td className="max-w-[320px] px-3 py-1.5 text-[12px] text-muted">
                      {row.issues.length === 0 ? (
                        <span className="text-subtle">—</span>
                      ) : (
                        row.issues.map((issue, index) => (
                          <span
                            key={index}
                            className={cn(
                              "block",
                              issue.level === "error" ? "text-negative" : "text-warning",
                            )}
                          >
                            {issue.message}
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-col justify-between gap-3 sm:flex-row">
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Change the mapping
        </Button>
        <Button onClick={onImport} loading={busy} disabled={summary.importable === 0} size="lg">
          <Check className="h-4 w-4" aria-hidden />
          Import {summary.importable.toLocaleString()} record
          {summary.importable === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

function DoneStep({
  result,
  target,
  onAnother,
}: {
  result: { imported: number; skipped: number; failed: number };
  target: ImportTarget;
  onAnother: () => void;
}) {
  const destination =
    target === "AD_SPEND"
      ? "/ads"
      : target === "COGS"
        ? "/cogs"
        : `/${target.toLowerCase()}s`;

  return (
    <Card>
      <CardBody className="flex flex-col items-center py-12 text-center">
        <div className="rounded-full bg-positive-soft p-3.5">
          <CheckCircle2 className="h-7 w-7 text-positive" aria-hidden />
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-foreground">
          {result.imported.toLocaleString()} record{result.imported === 1 ? "" : "s"} imported
        </h2>
        <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
          Your dashboard and reports have been updated.
          {result.skipped > 0 &&
            ` ${result.skipped.toLocaleString()} row${result.skipped === 1 ? " was" : "s were"} skipped as duplicates.`}
          {result.failed > 0 &&
            ` ${result.failed.toLocaleString()} row${result.failed === 1 ? "" : "s"} could not be read and ${result.failed === 1 ? "was" : "were"} left out.`}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Button onClick={onAnother} variant="secondary">
            <Upload className="h-4 w-4" aria-hidden />
            Import another file
          </Button>
          <LinkButton href={destination} variant="primary" className="gap-2">
            View the imported data
            <ArrowRight className="h-4 w-4" aria-hidden />
          </LinkButton>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "positive" | "warning" | "negative";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        tone === "positive" && "border-positive-border bg-positive-soft",
        tone === "warning" && "border-warning-border bg-warning-soft",
        tone === "negative" && "border-negative-border bg-negative-soft",
        tone === "neutral" && "border-border-subtle bg-surface",
      )}
    >
      <p
        className={cn(
          "text-[12px] font-medium",
          tone === "positive" && "text-positive",
          tone === "warning" && "text-warning",
          tone === "negative" && "text-negative",
          tone === "neutral" && "text-muted",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "tabular mt-0.5 text-[20px] font-semibold tracking-[-0.02em]",
          tone === "positive" && "text-positive",
          tone === "warning" && "text-warning",
          tone === "negative" && "text-negative",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function RowStatusBadge({ status, skipped }: { status: string; skipped: boolean }) {
  switch (status) {
    case "error":
      return <Badge tone="negative">Cannot import</Badge>;
    case "duplicate":
      return <Badge tone="warning">{skipped ? "Duplicate — skipped" : "Duplicate"}</Badge>;
    case "warning":
      return <Badge tone="warning">Check</Badge>;
    default:
      return <Badge tone="positive">Ready</Badge>;
  }
}

function typeHint(type: ImportField["type"]): string {
  switch (type) {
    case "date":
      return "A date in any common format";
    case "money":
      return "A number — currency symbols and commas are fine";
    case "number":
      return "A whole number";
    case "enum":
      return "Matched loosely to a known value";
    default:
      return "Text";
  }
}

function formatCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value);
  // ISO timestamps from the parser read better as plain dates.
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return formatDate(text);
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}
