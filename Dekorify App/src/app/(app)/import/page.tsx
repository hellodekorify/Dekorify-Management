import type { Metadata } from "next";
import { FileSpreadsheet } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableEmpty, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { IMPORT_TARGETS } from "@/lib/constants";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import Data" };

function targetLabel(value: string): string {
  if (!value) return "—";
  return IMPORT_TARGETS.find((target) => target.value === value)?.label ?? value;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ImportPage() {
  const { store } = await requireContext();

  const history = await prisma.importBatch.findMany({
    where: { storeId: store.id, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return (
    <>
      <PageHeader
        title="Import data"
        description="Bring in Excel or CSV exports — Shopify orders, Meta billing, your expense sheet or a supplier price list."
      />

      <PageBody className="space-y-6">
        <ImportWizard />

        <Card className="overflow-hidden">
          <CardHeader
            title="Recent imports"
            description="Every upload is kept, along with the original file, so an import can always be traced back."
          />
          <TableWrap>
            <THead>
              <TH>File</TH>
              <TH>Imported as</TH>
              <TH>When</TH>
              <TH align="right">Rows</TH>
              <TH align="right">Imported</TH>
              <TH align="right">Skipped</TH>
              <TH>Status</TH>
            </THead>
            <tbody>
              {history.length === 0 ? (
                <TableEmpty
                  colSpan={7}
                  title="No imports yet"
                  description="Upload your first spreadsheet above and it will appear here."
                />
              ) : (
                history.map((batch) => (
                  <TR key={batch.id}>
                    <TD>
                      <span className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0">
                          <span className="block max-w-[280px] truncate font-medium">
                            {batch.fileName}
                          </span>
                          <span className="block text-[12px] text-muted">
                            {formatBytes(batch.fileSize)}
                            {batch.sheetName ? ` · ${batch.sheetName}` : ""}
                          </span>
                        </span>
                      </span>
                    </TD>
                    <TD className="text-[13px] text-muted-strong">
                      {targetLabel(batch.targetEntity)}
                    </TD>
                    <TD numeric className="text-[13px] text-muted-strong">
                      {formatDate(batch.createdAt)}
                    </TD>
                    <TD numeric align="right">
                      {batch.totalRows.toLocaleString()}
                    </TD>
                    <TD numeric align="right" className="font-medium">
                      {batch.importedRows.toLocaleString()}
                    </TD>
                    <TD numeric align="right" className="text-muted-strong">
                      {batch.skippedRows > 0 ? batch.skippedRows.toLocaleString() : "—"}
                    </TD>
                    <TD>
                      {batch.status === "COMPLETED" ? (
                        <Badge tone="positive">Completed</Badge>
                      ) : batch.status === "FAILED" ? (
                        <span title={batch.errorMessage ?? undefined}>
                          <Badge tone="negative">Failed</Badge>
                        </span>
                      ) : (
                        <Badge tone="neutral">{batch.status}</Badge>
                      )}
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </TableWrap>
        </Card>
      </PageBody>
    </>
  );
}
