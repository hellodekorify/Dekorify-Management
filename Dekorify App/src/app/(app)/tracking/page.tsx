import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Radar, WifiOff } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { LEOPARDS_CODE, resolveCredentials } from "@/lib/leopards/courier";
import { prisma } from "@/lib/db";
import { knownLocations, listShipments, shipmentCounts, SUMMARY_CARDS } from "@/lib/leopards/queries";
import { readTrackingSettings } from "@/lib/leopards/settings";
import { lastSuccessfulSync, lastSync } from "@/lib/leopards/sync-tracking";
import {
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_TONES,
  type ShipmentStatus,
} from "@/lib/leopards/statuses";
import { formatPktShort, relativeTime } from "@/lib/leopards/format";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { AddShipmentsButton, RefreshButton, TrackingFilters } from "./tracking-client";

export const metadata: Metadata = { title: "Shipment tracking" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TrackingPage({ searchParams }: PageProps) {
  const { store } = await requireContext();
  const params = await searchParams;

  const status = one(params.status) ?? "ALL";
  const filters = {
    status,
    location: one(params.location),
    search: one(params.search),
    from: one(params.from),
    to: one(params.to),
    sort: (one(params.sort) ?? "recent") as "recent" | "oldest" | "cn" | "status",
    page: Number(one(params.page) ?? 1) || 1,
  };

  const courier = await prisma.courier.findUnique({
    where: { storeId_code: { storeId: store.id, code: LEOPARDS_CODE } },
  });
  const connected = courier ? resolveCredentials(courier) !== null : false;

  const [counts, page, locations, settings, latest, latestOk] = await Promise.all([
    shipmentCounts(store.id),
    listShipments(store.id, filters),
    knownLocations(store.id),
    readTrackingSettings(store.id),
    lastSync(store.id),
    lastSuccessfulSync(store.id),
  ]);

  return (
    <>
      <PageHeader
        title="Shipment tracking"
        description="Every parcel as Leopards Courier reports it. Nothing on this page comes from any other system."
        actions={
          <div className="flex items-center gap-2.5">
            <RefreshButton />
            <AddShipmentsButton />
          </div>
        }
        filters={<TrackingFilters locations={locations} />}
      />

      <div className="space-y-5 p-6">
        <SyncBanner
          connected={connected}
          latest={latest}
          latestOk={latestOk}
          intervalMinutes={settings.intervalMinutes}
          autoSyncEnabled={settings.autoSyncEnabled}
        />

        {/* Summary cards double as the status filter. */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {SUMMARY_CARDS.map((card) => {
            const value = card.key === "ALL" ? counts.total : (counts.byStatus[card.key] ?? 0);
            const active = status === card.key;
            const query = card.key === "ALL" ? "" : `?status=${card.key}`;

            return (
              <Link
                key={card.key}
                href={`/tracking${query}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "rounded-xl border bg-surface px-4 py-3.5 transition-colors",
                  active
                    ? "border-brand-border bg-brand-soft"
                    : "border-border-subtle hover:border-border-strong",
                )}
              >
                <p className="truncate text-[12.5px] font-medium text-muted">{card.label}</p>
                <p
                  className={cn(
                    "tabular mt-1 text-[19px] font-semibold tracking-[-0.02em]",
                    active ? "text-brand" : "text-foreground",
                  )}
                >
                  {value}
                </p>
              </Link>
            );
          })}
        </div>

        {(counts.failing > 0 || counts.neverSynced > 0) && (
          <div className="flex flex-wrap gap-2">
            {counts.failing > 0 && (
              <Link href="/tracking?status=FAILING">
                <Badge tone="negative" dot>
                  {counts.failing} could not be refreshed
                </Badge>
              </Link>
            )}
            {counts.neverSynced > 0 && (
              <Link href="/tracking?status=NEVER_SYNCED">
                <Badge tone="warning" dot>
                  {counts.neverSynced} never fetched
                </Badge>
              </Link>
            )}
          </div>
        )}

        <Card>
          {page.rows.length === 0 ? (
            <CardBody>
              {counts.total === 0 ? (
                <EmptyState
                  icon={Radar}
                  title="No shipments are being tracked yet"
                  description="Leopards has no endpoint that lists your parcels, so the CN numbers have to be added here. Paste them in and every detail is fetched from Leopards."
                />
              ) : (
                <EmptyState
                  icon={Radar}
                  title="Nothing matches those filters"
                  description="Clear the filters to see every tracked shipment."
                />
              )}
            </CardBody>
          ) : (
            <>
              <TableWrap>
                <THead>
                  <TH>CN number</TH>
                  <TH>Reference</TH>
                  <TH>Status</TH>
                  <TH>Current location</TH>
                  <TH>Last update</TH>
                  <TH align="right">Attempts</TH>
                  <TH>Destination</TH>
                  <TH align="right">Action</TH>
                </THead>
                <tbody>
                    {page.rows.map((row) => {
                      const tone = SHIPMENT_STATUS_TONES[row.status as ShipmentStatus] ?? "neutral";
                      const label =
                        SHIPMENT_STATUS_LABELS[row.status as ShipmentStatus] ?? row.status;

                      return (
                        <TR key={row.id}>
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
                            <div className="flex flex-col gap-1">
                              <Badge tone={tone}>{label}</Badge>
                              {/* Leopards' own wording, in case our bucket
                                  flattens a distinction that matters. */}
                              {row.courierStatus && row.courierStatus !== label && (
                                <span className="text-[11.5px] text-muted">{row.courierStatus}</span>
                              )}
                            </div>
                          </TD>
                          <TD>
                            <span className={row.currentLocation ? "" : "text-muted italic"}>
                              {row.currentLocation ?? "not provided"}
                            </span>
                          </TD>
                          <TD>
                            <div className="flex flex-col">
                              <span>{formatPktShort(row.lastEventAt)}</span>
                              {row.lastSyncError && (
                                <span className="text-[11.5px] text-negative">
                                  refresh failed
                                </span>
                              )}
                            </div>
                          </TD>
                          <TD align="right" className="tabular">
                            {row.deliveryAttempts}
                          </TD>
                          <TD>{row.destinationCity ?? <span className="text-muted italic">—</span>}</TD>
                          <TD align="right">
                            <LinkButton href={`/tracking/${row.trackingNumber}`} variant="ghost">
                              History
                            </LinkButton>
                          </TD>
                        </TR>
                      );
                    })}
                </tbody>
              </TableWrap>

              {page.pageCount > 1 && (
                <div className="border-t border-border-subtle px-4 py-3">
                  <Pagination
                    page={page.page}
                    pageSize={page.perPage}
                    total={page.total}
                    hrefFor={(next) => {
                      const query = new URLSearchParams();
                      for (const [key, value] of Object.entries(params)) {
                        const single = one(value);
                        if (single) query.set(key, single);
                      }
                      query.set("page", String(next));
                      return `/tracking?${query.toString()}`;
                    }}
                  />
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

/**
 * The freshness banner.
 *
 * It states what was actually last heard from Leopards and when. A dashboard
 * that shows stale data while implying it is live is worse than one that
 * admits the gap, so a failed sync says so and still names the last good one.
 */
function SyncBanner({
  connected,
  latest,
  latestOk,
  intervalMinutes,
  autoSyncEnabled,
}: {
  connected: boolean;
  latest: Awaited<ReturnType<typeof lastSync>>;
  latestOk: Awaited<ReturnType<typeof lastSuccessfulSync>>;
  intervalMinutes: number;
  autoSyncEnabled: boolean;
}) {
  if (!connected) {
    return (
      <Banner tone="negative" icon={WifiOff}>
        <span>
          Leopards API credentials are not configured, so nothing can be fetched.{" "}
          <Link href="/settings/tracking" className="font-medium underline">
            Add them in settings
          </Link>
          .
        </span>
      </Banner>
    );
  }

  if (!latest) {
    return (
      <Banner tone="warning" icon={Clock}>
        No synchronisation has run yet. Press Refresh now to fetch from Leopards.
      </Banner>
    );
  }

  const failed = latest.status === "FAILED";

  return (
    <Banner
      tone={failed ? "negative" : "neutral"}
      icon={failed ? AlertTriangle : CheckCircle2}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {failed ? (
          <>
            <span className="font-medium">Last refresh failed.</span>
            <span>{latest.message ?? "Leopards could not be reached."}</span>
            <span className="text-muted">
              Last successful synchronisation:{" "}
              {latestOk ? `${formatPktShort(latestOk.startedAt)} (${relativeTime(latestOk.startedAt)})` : "never"}.
            </span>
          </>
        ) : (
          <>
            <span>
              <span className="font-medium">Last synchronised</span> {relativeTime(latest.startedAt)}
              {" · "}
              {formatPktShort(latest.startedAt)}
            </span>
            <span className="text-muted">
              {latest.itemsChecked} checked, {latest.itemsUpdated} updated
              {latest.itemsFailed > 0 ? `, ${latest.itemsFailed} failed` : ""}
            </span>
            <span className="text-muted">
              {autoSyncEnabled
                ? `Automatic refresh every ${intervalMinutes} minutes.`
                : "Automatic refresh is off."}
            </span>
          </>
        )}
      </span>
    </Banner>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: "neutral" | "warning" | "negative";
  icon: typeof Clock;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-border-subtle bg-surface text-foreground",
    warning: "border-warning-border bg-warning-soft text-warning",
    negative: "border-negative-border bg-negative-soft text-negative",
  };

  return (
    <div
      className={cn("flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px]", tones[tone])}
      role="status"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

