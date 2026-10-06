import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Radar } from "lucide-react";
import { requireContext, requirePermission } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  dailyMovement,
  shiftDate,
  todayPkt,
  type MovementRow,
} from "@/lib/leopards/queries";
import { SHIPMENT_STATUS, type ShipmentStatus } from "@/lib/leopards/statuses";
import { formatCod, formatPkt } from "@/lib/leopards/format";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { TableWrap, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata: Metadata = { title: "Daily movement · Tracking" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Tiles, in the order the team reads them. */
const TILES: { status: ShipmentStatus; label: string }[] = [
  { status: SHIPMENT_STATUS.PICKED_UP, label: "Picked up" },
  { status: SHIPMENT_STATUS.IN_TRANSIT, label: "In transit" },
  { status: SHIPMENT_STATUS.OUT_FOR_DELIVERY, label: "Out for delivery" },
  { status: SHIPMENT_STATUS.DELIVERED, label: "Delivered" },
  { status: SHIPMENT_STATUS.ATTEMPT_FAILED, label: "Attempt failed" },
  { status: SHIPMENT_STATUS.CUSTOMER_NOT_AVAILABLE, label: "Customer unavailable" },
  { status: SHIPMENT_STATUS.EXCEPTION, label: "Exceptions" },
];

export default async function DailyMovementPage({ searchParams }: PageProps) {
  await requirePermission("Orders", "View");
  const { store } = await requireContext();
  const params = await searchParams;

  const today = todayPkt();
  const requested = one(params.date);
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;

  const movement = await dailyMovement(store.id, date);
  const isToday = movement.date === today;
  const newlyReturned = movement.returned.filter((row) => row.newlyReturned).length;

  return (
    <>
      <PageHeader
        title="Daily movement"
        description="Which parcels changed status on the chosen day, and which moved to Returned, so those customers can be contacted and investigated. Built only from events Leopards has reported."
        actions={
          <Link
            href="/tracking"
            className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All shipments
          </Link>
        }
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={`/tracking/daily?date=${shiftDate(movement.date, -1)}`} variant="ghost">
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Previous day
            </LinkButton>
            <form method="get" className="flex items-center gap-2">
              <input
                type="date"
                name="date"
                defaultValue={movement.date}
                max={today}
                aria-label="Day"
                className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] text-foreground"
              />
              <button
                type="submit"
                className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium text-foreground hover:bg-surface-muted"
              >
                Show
              </button>
            </form>
            {!isToday && (
              <LinkButton href={`/tracking/daily?date=${shiftDate(movement.date, 1)}`} variant="ghost">
                Next day
                <ChevronRight className="h-4 w-4" aria-hidden />
              </LinkButton>
            )}
            {!isToday && (
              <LinkButton href="/tracking/daily" variant="ghost">
                Today
              </LinkButton>
            )}
          </div>
        }
      />

      <div className="space-y-5 p-6">
        {movement.neverFetched > 0 && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-[13px] text-warning"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {movement.neverFetched} tracked parcels have not been fetched from Leopards yet, so
              they are missing from these figures.{" "}
              <Link href="/tracking?status=NEVER_SYNCED" className="font-medium underline">
                View them
              </Link>
              .
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <Tile label="Parcels with movement" value={movement.moved} tone="brand" />
          <Tile
            label="Returned today"
            value={movement.returned.length}
            note={newlyReturned > 0 ? `${newlyReturned} newly returned` : undefined}
            tone={movement.returned.length > 0 ? "negative" : undefined}
          />
          {TILES.map((tile) => (
            <Tile
              key={tile.status}
              label={tile.label}
              value={movement.byStatus[tile.status] ?? 0}
            />
          ))}
        </div>
        <p className="text-[12px] text-subtle">
          Each parcel is counted once, under the status of its last event on {movement.date}. A
          parcel that turned Returned that day is listed below instead.
        </p>

        <Card>
          <CardHeader
            title="Returned"
            description="Contact these customers and find out what happened."
          />
          {movement.returned.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={Radar}
                title="No parcels moved to Returned on this day"
                description="Leopards reported no return event for any fetched parcel."
              />
            </CardBody>
          ) : (
            <MovementTable rows={movement.returned} showNew />
          )}
        </Card>

        <Card>
          <CardHeader
            title="At risk of return"
            description="Delivery failed or the customer could not be reached, with no return yet."
          />
          {movement.atRisk.length === 0 ? (
            <CardBody>
              <p className="py-4 text-center text-[13px] text-muted">
                No failed or unanswered deliveries on this day.
              </p>
            </CardBody>
          ) : (
            <MovementTable rows={movement.atRisk} />
          )}
        </Card>
      </div>
    </>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note?: string;
  tone?: "brand" | "negative";
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3.5">
      <p className="truncate text-[12.5px] font-medium text-muted">{label}</p>
      <p
        className={cn(
          "tabular mt-1 text-[19px] font-semibold tracking-[-0.02em]",
          tone === "brand" && "text-brand",
          tone === "negative" && "text-negative",
          !tone && "text-foreground",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11.5px] text-muted">{note}</p>}
    </div>
  );
}

function MovementTable({ rows, showNew }: { rows: MovementRow[]; showNew?: boolean }) {
  return (
    <TableWrap>
      <THead>
        <TH>CN number</TH>
        <TH>Reference</TH>
        <TH>Consignee</TH>
        <TH>Destination</TH>
        <TH align="right">COD</TH>
        <TH>What Leopards reported</TH>
        <TH>When</TH>
        <TH align="right">Action</TH>
      </THead>
      <tbody>
        {rows.map((row) => (
          <TR key={row.trackingNumber}>
            <TD>
              <Link
                href={`/tracking/${row.trackingNumber}`}
                className="font-mono text-[13px] font-medium text-brand hover:underline"
              >
                {row.trackingNumber}
              </Link>
            </TD>
            <TD>
              <span className={row.referenceNumber ? "" : "text-muted italic"}>
                {row.referenceNumber ?? "not provided"}
              </span>
            </TD>
            <TD>
              <div className="flex flex-col">
                <span className={row.consigneeName ? "" : "text-muted italic"}>
                  {row.consigneeName ?? "not provided"}
                </span>
                {row.consigneePhone && (
                  <span className="text-[11.5px] text-muted">{row.consigneePhone}</span>
                )}
              </div>
            </TD>
            <TD>{row.destinationCity ?? <span className="text-muted italic">—</span>}</TD>
            <TD align="right" className="tabular">
              {formatCod(row.codAmount)}
            </TD>
            <TD>
              <div className="flex flex-col gap-1">
                <span>{row.eventStatus}</span>
                {row.reason && <span className="text-[11.5px] text-warning">Reason: {row.reason}</span>}
                {showNew && row.newlyReturned && (
                  <span>
                    <Badge tone="negative">Newly returned</Badge>
                  </span>
                )}
              </div>
            </TD>
            <TD>{formatPkt(row.occurredAt)}</TD>
            <TD align="right">
              <LinkButton href={`/tracking/${row.trackingNumber}`} variant="ghost">
                History
              </LinkButton>
            </TD>
          </TR>
        ))}
      </tbody>
    </TableWrap>
  );
}

