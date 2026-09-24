import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, MapPin, Package } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { getShipment } from "@/lib/leopards/queries";
import {
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_TONES,
  type ShipmentStatus,
} from "@/lib/leopards/statuses";
import {
  formatCod,
  formatPkt,
  formatWeight,
  NOT_PROVIDED,
  orNotProvided,
  relativeTime,
} from "@/lib/leopards/format";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { RefreshButton } from "../tracking-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ cn: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { cn: trackingNumber } = await params;
  return { title: `${trackingNumber.toUpperCase()} · Tracking` };
}

export default async function ShipmentPage({ params }: PageProps) {
  const { store } = await requireContext();
  const { cn: trackingNumber } = await params;

  const shipment = await getShipment(store.id, trackingNumber);
  if (!shipment) notFound();

  const tone = SHIPMENT_STATUS_TONES[shipment.status as ShipmentStatus] ?? "neutral";
  const label = SHIPMENT_STATUS_LABELS[shipment.status as ShipmentStatus] ?? shipment.status;

  const attempts = shipment.events.filter((event) => event.isAttempt);
  const failedAttempts = attempts.filter((event) => !/\bdeliver/i.test(event.status));

  return (
    <>
      <PageHeader
        title={shipment.trackingNumber}
        description={
          shipment.referenceNumber
            ? `Leopards reference ${shipment.referenceNumber}`
            : "Leopards did not return a reference for this parcel"
        }
        actions={
          <div className="flex items-center gap-2.5">
            <Link
              href="/tracking"
              className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All shipments
            </Link>
            <RefreshButton trackingNumber={shipment.trackingNumber} label="Refresh this parcel" />
          </div>
        }
      />

      <div className="space-y-5 p-6">
        {shipment.lastSyncError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-negative-border bg-negative-soft px-4 py-3 text-[13px] text-negative"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Could not retrieve the latest Leopards update.</p>
              <p className="mt-0.5">{shipment.lastSyncError}</p>
              <p className="mt-0.5 opacity-80">
                Last successful synchronisation:{" "}
                {shipment.lastSyncOkAt ? formatPkt(shipment.lastSyncOkAt) : "never"}. Everything
                below is from that point in time.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={tone}>{label}</Badge>
          {shipment.courierStatus && (
            <span className="text-[13px] text-muted">
              Leopards says: <span className="text-foreground">{shipment.courierStatus}</span>
            </span>
          )}
          <span className="text-[12.5px] text-muted">
            Synchronised {relativeTime(shipment.lastSyncOkAt)}
          </span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* --- Timeline ---------------------------------------------- */}
          <Card>
            <CardHeader
              title="Tracking timeline"
              description="Every event Leopards has recorded, in their words."
            />
            <CardBody>
              {shipment.events.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted">
                  {shipment.lastSyncOkAt
                    ? "Leopards has recorded no tracking events for this parcel yet."
                    : "This parcel has not been fetched from Leopards yet."}
                </p>
              ) : (
                <ol className="relative space-y-0">
                  {shipment.events.map((event, index) => {
                    const isLast = index === shipment.events.length - 1;
                    const isFailure =
                      event.isAttempt && !/\bdeliver/i.test(event.status);

                    return (
                      <li key={event.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                        {/* Connector, drawn only between events. */}
                        {!isLast && (
                          <span
                            className="absolute top-4 left-[7px] h-full w-px bg-border-strong"
                            aria-hidden
                          />
                        )}
                        <span
                          className={cn(
                            "relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 bg-surface",
                            isLast && !isFailure && "border-positive",
                            isFailure && "border-negative",
                            !isLast && !isFailure && "border-border-strong",
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-[13.5px] font-medium",
                              isFailure ? "text-negative" : "text-foreground",
                            )}
                          >
                            {/* Leopards' exact wording, not a paraphrase. */}
                            {event.status}
                          </p>
                          <p className="mt-0.5 text-[12.5px] text-muted">
                            {event.occurredAt ? formatPkt(event.occurredAt) : NOT_PROVIDED}
                            {event.location && (
                              <>
                                {" · "}
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3" aria-hidden />
                                  {event.location}
                                </span>
                              </>
                            )}
                          </p>
                          {event.reason && (
                            <p className="mt-1 text-[12.5px] text-warning">Reason: {event.reason}</p>
                          )}
                          {event.receiverName && (
                            <p className="mt-1 text-[12.5px] text-muted">
                              Received by: {event.receiverName}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardBody>
          </Card>

          {/* --- Details ------------------------------------------------ */}
          <div className="space-y-5">
            <Card>
              <CardHeader title="Shipment" />
              <CardBody className="space-y-0">
                <Detail label="CN number" value={shipment.trackingNumber} mono />
                <Detail label="Reference" value={orNotProvided(shipment.referenceNumber)} />
                <Detail label="Leopards packet id" value={orNotProvided(shipment.packetId)} />
                <Detail label="Origin" value={orNotProvided(shipment.originCity)} />
                <Detail label="Destination" value={orNotProvided(shipment.destinationCity)} />
                <Detail label="Current location" value={orNotProvided(shipment.currentLocation)} />
                <Detail label="Booked" value={formatPkt(shipment.bookedAt)} />
                <Detail label="Last update" value={formatPkt(shipment.lastEventAt)} />
                <Detail label="Weight" value={formatWeight(shipment.weightGrams)} />
                <Detail
                  label="Pieces"
                  value={shipment.pieces === null ? NOT_PROVIDED : String(shipment.pieces)}
                />
                <Detail label="Amount to collect" value={formatCod(shipment.codAmount)} />
                <Detail label="Contents" value={orNotProvided(shipment.specialInstructions)} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Delivery" />
              <CardBody className="space-y-0">
                <Detail label="Attempts recorded" value={String(shipment.deliveryAttempts)} />
                <Detail
                  label="Failed attempts"
                  value={String(failedAttempts.length)}
                  tone={failedAttempts.length > 0 ? "negative" : undefined}
                />
                <Detail label="Delivered" value={formatPkt(shipment.deliveredAt)} />
                <Detail label="Signed for by" value={orNotProvided(shipment.statusRemarks)} />
                <Detail label="Return CN" value={orNotProvided(shipment.reverseCn)} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Consignee"
                description="As recorded by Leopards at booking."
              />
              <CardBody className="space-y-0">
                <Detail label="Name" value={orNotProvided(shipment.consigneeName)} />
                <Detail label="Phone" value={orNotProvided(shipment.consigneePhone)} />
                <Detail label="Email" value={orNotProvided(shipment.consigneeEmail)} />
                <Detail label="Address" value={orNotProvided(shipment.consigneeAddress)} />
              </CardBody>
            </Card>

            <details className="rounded-xl border border-border-subtle bg-surface-muted p-4">
              <summary className="cursor-pointer text-[13px] font-medium text-foreground">
                Raw Leopards response
              </summary>
              <p className="mt-2 text-[12px] text-muted">
                Kept so any value above can be traced back to what Leopards actually sent.
              </p>
              <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-surface p-3 font-mono text-[11.5px] leading-relaxed">
                {shipment.rawResponse
                  ? JSON.stringify(JSON.parse(shipment.rawResponse), null, 2)
                  : "Nothing has been fetched for this parcel yet."}
              </pre>
            </details>
          </div>
        </div>

        <p className="flex items-center gap-1.5 text-[12px] text-subtle">
          <Package className="h-3.5 w-3.5" aria-hidden />
          Every field on this page comes from Leopards Courier. Anything they did not supply is
          marked &ldquo;{NOT_PROVIDED}&rdquo; rather than filled in from elsewhere.
        </p>
      </div>
    </>
  );
}

function Detail({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "negative";
}) {
  const absent = value === NOT_PROVIDED;

  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
      <dt className="shrink-0 text-[12.5px] text-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-[13px]",
          mono && "font-mono",
          absent ? "text-subtle italic" : "text-foreground",
          tone === "negative" && !absent && "text-negative",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
