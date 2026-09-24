import { prisma } from "../db";
import { SHIPMENT_STATUS, type ShipmentStatus } from "./statuses";

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
  sort?: "recent" | "oldest" | "cn" | "status";
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
  recent: [{ lastEventAt: "desc" as const }, { updatedAt: "desc" as const }],
  oldest: [{ lastEventAt: "asc" as const }],
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
      orderBy: ORDER_BY[filters.sort ?? "recent"],
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
