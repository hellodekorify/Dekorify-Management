import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { DASHBOARD_BUCKETS, ISSUE_STATUSES, bucketFor } from "./statuses";

/**
 * Read models for the tracking pages.
 *
 * The list view has to stay fast with thousands of orders, so counting and
 * filtering happen in the database against indexed columns — never by loading
 * orders into memory and filtering there.
 */

export interface OrderFilters {
  search?: string;
  bucket?: string;
  status?: string;
  courierId?: string;
  city?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  attempts?: string;
  from?: Date;
  to?: Date;
  issuesOnly?: boolean;
}

export function buildOrderWhere(storeId: string, filters: OrderFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    storeId,
    deletedAt: null,
  };

  if (filters.from || filters.to) {
    where.placedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  if (filters.issuesOnly) {
    where.OR = [{ hasIssue: true }, { status: { in: ISSUE_STATUSES } }];
  }

  if (filters.bucket) {
    const statuses = bucketFor(filters.bucket);
    if (statuses.length > 0) where.status = { in: statuses };
  }

  if (filters.status) where.status = filters.status;
  if (filters.city) where.city = filters.city;
  if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

  if (filters.courierId) {
    where.shipments = { some: { courierId: filters.courierId, deletedAt: null } };
  }

  if (filters.attempts) {
    if (filters.attempts === "0") where.deliveryAttempts = 0;
    else if (filters.attempts === "1") where.deliveryAttempts = 1;
    else if (filters.attempts === "2+") where.deliveryAttempts = { gte: 2 };
    else if (filters.attempts === "3+") where.deliveryAttempts = { gte: 3 };
  }

  // Search spans the five identifiers an operator actually has to hand.
  const search = filters.search?.trim();
  if (search) {
    where.AND = [
      {
        OR: [
          { orderNumber: { contains: search } },
          { shopifyOrderId: { contains: search } },
          { customerName: { contains: search } },
          { customerPhone: { contains: search } },
          { customerEmail: { contains: search } },
          { city: { contains: search } },
          { shipments: { some: { trackingNumber: { contains: search } } } },
        ],
      },
    ];
  }

  return where;
}

export const ORDER_SORTS: Record<string, Prisma.OrderOrderByWithRelationInput> = {
  newest: { placedAt: "desc" },
  oldest: { placedAt: "asc" },
  value_desc: { totalMinor: "desc" },
  value_asc: { totalMinor: "asc" },
  updated: { lastTrackingAt: "desc" },
  attempts: { deliveryAttempts: "desc" },
  status: { status: "asc" },
};

export const ORDER_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Last tracking update" },
  { value: "value_desc", label: "Highest value" },
  { value: "value_asc", label: "Lowest value" },
  { value: "attempts", label: "Most delivery attempts" },
  { value: "status", label: "Delivery status" },
];

export interface BucketCount {
  key: string;
  label: string;
  tone: string;
  count: number;
}

/**
 * Counts for the dashboard cards. One grouped query rather than one per card.
 */
export async function bucketCounts(
  storeId: string,
  window: { from?: Date; to?: Date },
): Promise<{ buckets: BucketCount[]; total: number; issues: number }> {
  const base: Prisma.OrderWhereInput = {
    storeId,
    deletedAt: null,
    ...(window.from || window.to
      ? {
          placedAt: {
            ...(window.from ? { gte: window.from } : {}),
            ...(window.to ? { lte: window.to } : {}),
          },
        }
      : {}),
  };

  const [grouped, total, issues] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.order.count({ where: base }),
    prisma.order.count({
      where: { ...base, OR: [{ hasIssue: true }, { status: { in: ISSUE_STATUSES } }] },
    }),
  ]);

  const byStatus = new Map(grouped.map((row) => [row.status, row._count._all]));

  const buckets = DASHBOARD_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    tone: bucket.tone,
    count: bucket.statuses.reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0),
  }));

  return { buckets, total, issues };
}

/** Distinct cities present on the store's orders, for the city filter. */
export async function orderCities(storeId: string): Promise<string[]> {
  const rows = await prisma.order.findMany({
    where: { storeId, deletedAt: null, city: { not: null } },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
    take: 200,
  });
  return rows.map((row) => row.city!).filter(Boolean);
}

export const ORDER_LIST_INCLUDE = {
  shipments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: { courier: { select: { name: true, code: true, trackingUrlTemplate: true } } },
  },
  items: { select: { title: true, quantity: true, sku: true } },
} satisfies Prisma.OrderInclude;

export type OrderListRow = Prisma.OrderGetPayload<{ include: typeof ORDER_LIST_INCLUDE }>;

/**
 * Delivery performance, computed from shipments and their derived fields.
 */
export interface DeliveryPerformance {
  shipments: number;
  delivered: number;
  failed: number;
  returned: number;
  inFlight: number;
  successRatePct: number | null;
  averageAttempts: number | null;
  averageDeliveryHours: number | null;
}

export async function deliveryPerformance(
  storeId: string,
  window: { from?: Date; to?: Date },
  courierId?: string,
): Promise<DeliveryPerformance> {
  const where: Prisma.ShipmentWhereInput = {
    storeId,
    deletedAt: null,
    ...(courierId ? { courierId } : {}),
    ...(window.from || window.to
      ? {
          createdAt: {
            ...(window.from ? { gte: window.from } : {}),
            ...(window.to ? { lte: window.to } : {}),
          },
        }
      : {}),
  };

  const shipments = await prisma.shipment.findMany({
    where,
    select: {
      status: true,
      deliveryAttempts: true,
      bookedAt: true,
      deliveredAt: true,
      returnedAt: true,
    },
  });

  const delivered = shipments.filter((shipment) => shipment.status === "DELIVERED");
  const returned = shipments.filter(
    (shipment) => shipment.status === "RETURNED" || shipment.status === "REFUSED",
  );
  const failed = shipments.filter((shipment) => shipment.status === "DELIVERY_FAILED");

  // Only settled shipments count towards a success rate — parcels still moving
  // would otherwise drag it down and make the figure meaningless.
  const settled = delivered.length + returned.length + failed.length;

  const deliveryDurations = delivered
    .filter((shipment) => shipment.bookedAt && shipment.deliveredAt)
    .map(
      (shipment) =>
        (shipment.deliveredAt!.getTime() - shipment.bookedAt!.getTime()) / 3_600_000,
    )
    .filter((hours) => hours >= 0 && hours < 24 * 60);

  const attempts = shipments.map((shipment) => shipment.deliveryAttempts);

  return {
    shipments: shipments.length,
    delivered: delivered.length,
    failed: failed.length,
    returned: returned.length,
    inFlight: shipments.length - settled,
    successRatePct: settled === 0 ? null : (delivered.length / settled) * 100,
    averageAttempts:
      attempts.length === 0
        ? null
        : attempts.reduce((sum, value) => sum + value, 0) / attempts.length,
    averageDeliveryHours:
      deliveryDurations.length === 0
        ? null
        : deliveryDurations.reduce((sum, value) => sum + value, 0) / deliveryDurations.length,
  };
}
