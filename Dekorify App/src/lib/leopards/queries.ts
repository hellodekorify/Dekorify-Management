import { prisma } from "../db";
import { classifyStatus, SHIPMENT_STATUS, type ShipmentStatus } from "./statuses";

/**
 * Read models for the tracking dashboard.
 *
 * Everything returned here originates in a Leopards response. Where Leopards
 * gave nothing, the field stays null and the UI says so — no field is filled
 * in from another system or inferred from a neighbouring value.
 */

export interface ShipmentFilters {
  status?: string;
  location?: string;
  search?: string;
  /** ISO dates bounding the last tracking event. */
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
  sort?: "booked_desc" | "recent" | "cn" | "status";
}

export const PER_PAGE = 50;

export interface StatusCounts {
  total: number;
  byStatus: Record<string, number>;
  /** Never synced, so nothing is known about them yet. */
  neverSynced: number;
  /** Last sync attempt failed. */
  failing: number;
}

export async function shipmentCounts(storeId: string): Promise<StatusCounts> {
  const [grouped, total, neverSynced, failing] = await Promise.all([
    prisma.leopardsShipment.groupBy({
      by: ["status"],
      where: { storeId },
      _count: { _all: true },
    }),
    prisma.leopardsShipment.count({ where: { storeId } }),
    prisma.leopardsShipment.count({ where: { storeId, lastSyncedAt: null } }),
    prisma.leopardsShipment.count({ where: { storeId, lastSyncError: { not: null } } }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of grouped) byStatus[row.status] = row._count._all;

  return { total, byStatus, neverSynced, failing };
}

function buildWhere(storeId: string, filters: ShipmentFilters) {
  const where: Record<string, unknown> = { storeId };

  if (filters.status && filters.status !== "ALL") {
    if (filters.status === "FAILING") where.lastSyncError = { not: null };
    else if (filters.status === "NEVER_SYNCED") where.lastSyncedAt = null;
    else where.status = filters.status;
  }

  if (filters.location) {
    where.currentLocation = { contains: filters.location };
  }

  if (filters.from || filters.to) {
    const range: Record<string, Date> = {};
    if (filters.from) range.gte = new Date(`${filters.from}T00:00:00`);
    if (filters.to) range.lte = new Date(`${filters.to}T23:59:59`);
    where.lastEventAt = range;
  }

  const search = filters.search?.trim();
  if (search) {
    // Every identifier Leopards exposes, so one box covers them all.
    where.OR = [
      { trackingNumber: { contains: search } },
      { referenceNumber: { contains: search } },
      { packetId: { contains: search } },
      { consigneeName: { contains: search } },
      { consigneePhone: { contains: search } },
      { destinationCity: { contains: search } },
    ];
  }

  return where;
}

const ORDER_BY = {
  // Always newest first. Nulls sort last on SQLite descending, so parcels not
  // yet fetched from Leopards sit at the bottom rather than the top.
  booked_desc: [{ bookedAt: "desc" as const }, { trackingNumber: "asc" as const }],
  recent: [{ lastEventAt: "desc" as const }, { updatedAt: "desc" as const }],
  cn: [{ trackingNumber: "asc" as const }],
  status: [{ status: "asc" as const }, { lastEventAt: "desc" as const }],
};

export async function listShipments(storeId: string, filters: ShipmentFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = filters.perPage ?? PER_PAGE;
  const where = buildWhere(storeId, filters);

  const [rows, total] = await Promise.all([
    prisma.leopardsShipment.findMany({
      where,
      orderBy: ORDER_BY[filters.sort ?? "booked_desc"] ?? ORDER_BY.booked_desc,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.leopardsShipment.count({ where }),
  ]);

  return { rows, total, page, perPage, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}

export async function getShipment(storeId: string, trackingNumber: string) {
  return prisma.leopardsShipment.findFirst({
    where: { storeId, trackingNumber: trackingNumber.toUpperCase() },
    include: {
      events: { orderBy: [{ occurredAt: "asc" }, { retrievedAt: "asc" }] },
    },
  });
}

/** Distinct locations Leopards has reported, for the location filter. */
export async function knownLocations(storeId: string): Promise<string[]> {
  const rows = await prisma.leopardsShipment.findMany({
    where: { storeId, currentLocation: { not: null } },
    select: { currentLocation: true },
    distinct: ["currentLocation"],
    orderBy: { currentLocation: "asc" },
    take: 200,
  });
  return rows.map((row) => row.currentLocation!).filter(Boolean);
}

/** Cards shown across the top of the dashboard, in the order they appear. */
export const SUMMARY_CARDS: { key: string; label: string; status?: ShipmentStatus }[] = [
  { key: "ALL", label: "Total shipments" },
  { key: SHIPMENT_STATUS.PENDING, label: "Pending", status: SHIPMENT_STATUS.PENDING },
  { key: SHIPMENT_STATUS.PICKED_UP, label: "Picked up", status: SHIPMENT_STATUS.PICKED_UP },
  { key: SHIPMENT_STATUS.IN_TRANSIT, label: "In transit", status: SHIPMENT_STATUS.IN_TRANSIT },
  {
    key: SHIPMENT_STATUS.OUT_FOR_DELIVERY,
    label: "Out for delivery",
    status: SHIPMENT_STATUS.OUT_FOR_DELIVERY,
  },
  { key: SHIPMENT_STATUS.DELIVERED, label: "Delivered", status: SHIPMENT_STATUS.DELIVERED },
  {
    key: SHIPMENT_STATUS.ATTEMPT_FAILED,
    label: "Attempt failed",
    status: SHIPMENT_STATUS.ATTEMPT_FAILED,
  },
  {
    key: SHIPMENT_STATUS.CUSTOMER_NOT_AVAILABLE,
    label: "Customer unavailable",
    status: SHIPMENT_STATUS.CUSTOMER_NOT_AVAILABLE,
  },
  { key: SHIPMENT_STATUS.RETURNED, label: "Returned", status: SHIPMENT_STATUS.RETURNED },
  { key: SHIPMENT_STATUS.EXCEPTION, label: "Exceptions", status: SHIPMENT_STATUS.EXCEPTION },
];

// ---------------------------------------------------------------------------
// Daily movement
// ---------------------------------------------------------------------------

/** Pakistan Standard Time is a fixed UTC+5; there is no daylight saving. */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's calendar date in Pakistan, as YYYY-MM-DD. */
export function todayPkt(now: Date = new Date()): string {
  return new Date(now.getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a Pakistan calendar day begins, or null for a malformed date. */
function pktDayStart(date: string): Date | null {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(ms)) return null;
  return new Date(ms - PKT_OFFSET_MS);
}

export function shiftDate(date: string, days: number): string {
  const start = pktDayStart(date) ?? pktDayStart(todayPkt())!;
  return todayPkt(new Date(start.getTime() + days * DAY_MS));
}

export interface MovementRow {
  trackingNumber: string;
  referenceNumber: string | null;
  consigneeName: string | null;
  consigneePhone: string | null;
  destinationCity: string | null;
  codAmount: string | null;
  /** Leopards' own wording for the event that put it in this list. */
  eventStatus: string;
  reason: string | null;
  occurredAt: Date;
  /** Returned only: no earlier returned event, i.e. it turned returned today. */
  newlyReturned: boolean;
}

export interface DailyMovement {
  date: string;
  /** Parcels with at least one Leopards event on the day. */
  moved: number;
  /** Count of moved parcels by where their last event of the day left them. */
  byStatus: Record<string, number>;
  returned: MovementRow[];
  atRisk: MovementRow[];
  neverFetched: number;
}

export async function dailyMovement(storeId: string, date: string): Promise<DailyMovement> {
  const start = pktDayStart(date) ?? pktDayStart(todayPkt())!;
  const end = new Date(start.getTime() + DAY_MS);
  const day = todayPkt(new Date(start.getTime()));

  const [events, neverFetched] = await Promise.all([
    prisma.leopardsTrackingEvent.findMany({
      where: { occurredAt: { gte: start, lt: end }, shipment: { storeId } },
      orderBy: { occurredAt: "asc" },
      include: {
        shipment: {
          select: {
            id: true,
            trackingNumber: true,
            referenceNumber: true,
            consigneeName: true,
            consigneePhone: true,
            destinationCity: true,
            codAmount: true,
          },
        },
      },
    }),
    prisma.leopardsShipment.count({ where: { storeId, lastSyncedAt: null } }),
  ]);

  // Group by parcel: its last event of the day decides the bucket it is
  // counted in, while a returned event at any point that day puts it on the
  // returned list.
  const byShipment = new Map<string, typeof events>();
  for (const event of events) {
    const list = byShipment.get(event.shipmentId) ?? [];
    list.push(event);
    byShipment.set(event.shipmentId, list);
  }

  const byStatus: Record<string, number> = {};
  const returnedHits: { event: (typeof events)[number]; shipmentId: string }[] = [];
  const atRiskRows: MovementRow[] = [];

  for (const [shipmentId, list] of byShipment) {
    const last = list[list.length - 1];
    const bucket = classifyStatus(last.statusWithCity ?? last.status).status;
    byStatus[bucket] = (byStatus[bucket] ?? 0) + 1;

    const returnedEvent = list.find(
      (event) => classifyStatus(event.statusWithCity ?? event.status).status === SHIPMENT_STATUS.RETURNED,
    );
    if (returnedEvent) {
      returnedHits.push({ event: returnedEvent, shipmentId });
      continue;
    }

    if (bucket === SHIPMENT_STATUS.ATTEMPT_FAILED || bucket === SHIPMENT_STATUS.CUSTOMER_NOT_AVAILABLE) {
      atRiskRows.push(toRow(last, false));
    }
  }

  // "Newly returned": the parcel had no returned event before today began.
  const earlier = returnedHits.length
    ? await prisma.leopardsTrackingEvent.findMany({
        where: { shipmentId: { in: returnedHits.map((hit) => hit.shipmentId) }, occurredAt: { lt: start } },
        select: { shipmentId: true, status: true, statusWithCity: true },
      })
    : [];
  const alreadyReturned = new Set(
    earlier
      .filter((event) => classifyStatus(event.statusWithCity ?? event.status).status === SHIPMENT_STATUS.RETURNED)
      .map((event) => event.shipmentId),
  );

  const byTimeDesc = (a: MovementRow, b: MovementRow) => b.occurredAt.getTime() - a.occurredAt.getTime();

  return {
    date: day,
    moved: byShipment.size,
    byStatus,
    returned: returnedHits
      .map((hit) => toRow(hit.event, !alreadyReturned.has(hit.shipmentId)))
      .sort(byTimeDesc),
    atRisk: atRiskRows.sort(byTimeDesc),
    neverFetched,
  };
}

function toRow(
  event: {
    status: string;
    reason: string | null;
    occurredAt: Date | null;
    shipment: {
      trackingNumber: string;
      referenceNumber: string | null;
      consigneeName: string | null;
      consigneePhone: string | null;
      destinationCity: string | null;
      codAmount: string | null;
    };
  },
  newlyReturned: boolean,
): MovementRow {
  return {
    trackingNumber: event.shipment.trackingNumber,
    referenceNumber: event.shipment.referenceNumber,
    consigneeName: event.shipment.consigneeName,
    consigneePhone: event.shipment.consigneePhone,
    destinationCity: event.shipment.destinationCity,
    codAmount: event.shipment.codAmount,
    eventStatus: event.status,
    reason: event.reason,
    occurredAt: event.occurredAt as Date,
    newlyReturned,
  };
}
