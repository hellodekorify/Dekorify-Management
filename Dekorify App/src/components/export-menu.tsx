"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExportPayload {
  /** Used for the filename and the heading inside the PDF. */
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  /** Right-align these column indices in the PDF. */
  numericColumns?: number[];
}

export function ExportMenu({
  payload,
  align = "right",
}: {
  payload: ExportPayload;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const fileBase = payload.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function exportCsv() {
    setBusy("csv");
    try {
      const lines = [payload.columns, ...payload.rows]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n");
      // The BOM makes Excel open UTF-8 correctly on Windows.
      download(new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8" }), `${fileBase}.csv`);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  async function exportXlsx() {
    setBusy("xlsx");
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.aoa_to_sheet([payload.columns, ...payload.rows]);

      sheet["!cols"] = payload.columns.map((header, index) => ({
        wch: Math.min(
          42,
          Math.max(
            12,
            header.length + 2,
            ...payload.rows.slice(0, 200).map((row) => String(row[index] ?? "").length + 2),
          ),
        ),
      }));

      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, sheetName(payload.title));
      XLSX.writeFile(book, `${fileBase}.xlsx`);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  async function exportPdf() {
    setBusy("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const landscape = payload.columns.length > 6;
      const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt" });

      doc.setFontSize(15);
      doc.text(payload.title, 40, 42);

      if (payload.subtitle) {
        doc.setFontSize(9.5);
        doc.setTextColor(110);
        doc.text(payload.subtitle, 40, 58);
        doc.setTextColor(0);
      }

      const numeric = new Set(payload.numericColumns ?? []);

      autoTable(doc, {
        head: [payload.columns],
        body: payload.rows.map((row) => row.map((cell) => String(cell ?? ""))),
        startY: payload.subtitle ? 74 : 60,
        styles: { fontSize: 8.5, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [16, 24, 40], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: Object.fromEntries(
          payload.columns.map((_, index) => [
            index,
            { halign: numeric.has(index) ? ("right" as const) : ("left" as const) },
          ]),
        ),
        margin: { left: 40, right: 40 },
      });

      const generated = `Generated ${new Date().toLocaleString("en-GB")}`;
      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page++) {
        doc.setPage(page);
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(generated, 40, doc.internal.pageSize.getHeight() - 20);
        doc.text(
          `Page ${page} of ${pageCount}`,
          doc.internal.pageSize.getWidth() - 40,
          doc.internal.pageSize.getHeight() - 20,
          { align: "right" },
        );
      }

      doc.save(`${fileBase}.pdf`);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  const options = [
    { id: "xlsx", label: "Excel (.xlsx)", icon: FileSpreadsheet, run: exportXlsx },
    { id: "csv", label: "CSV (.csv)", icon: Table2, run: exportCsv },
    { id: "pdf", label: "PDF (.pdf)", icon: FileText, run: exportPdf },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={payload.rows.length === 0}
        className="inline-flex h-9.5 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
        Export
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "animate-scale-in absolute top-full z-40 mt-1.5 w-48 overflow-hidden rounded-lg border border-border-subtle bg-surface py-1",
            align === "right" ? "right-0" : "left-0",
          )}
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              onClick={option.run}
              disabled={busy !== null}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-muted disabled:opacity-50"
            >
              <option.icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              {option.label}
            </button>
          ))}
          <p className="border-t border-border-subtle px-3 pt-2 pb-1.5 text-[11.5px] leading-snug text-muted">
            {payload.rows.length.toLocaleString()} row
            {payload.rows.length === 1 ? "" : "s"} will be exported.
          </p>
        </div>
      )}
    </div>
  );
}

function csvCell(value: string | number): string {
  const text = String(value ?? "");
  // A leading =, +, - or @ makes Excel treat the cell as a formula.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function sheetName(title: string): string {
  // Excel rejects these characters and anything over 31 characters.
  return title.replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Report";
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
