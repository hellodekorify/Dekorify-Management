import { createHash } from "node:crypto";
import { prisma } from "../db";
import {
  isAttemptStatus,
  isIssueStatus,
  isTerminalStatus,
  statusRank,
  ORDER_STATUS,
} from "./statuses";

/**
 * The tracking engine.
 *
 * Two rules govern everything here:
 *
 *  1. Tracking events are append-only. A re-sync must never rewrite history,
 *     so every event carries a `dedupeKey` and insertion is idempotent.
 *  2. Everything else is derived. A shipment's status, its location, its
 *     delivery-attempt count and the parent order's status are all recomputed
 *     from the event log rather than written independently — so they cannot
 *     drift out of step with the evidence.
 */

export type EventSource = "SHOPIFY" | "LEOPARDS" | "MANUAL" | "SYSTEM";

export interface IncomingEvent {
  occurredAt: Date;
  source: EventSource;
  internalStatus: string;
  courierStatus?: string | null;
  location?: string | null;
  description?: string | null;
  notes?: string | null;
  userId?: string | null;
  rawPayload?: string | null;
  /**
   * Whether this event represents the parcel being physically presented.
   * Supplied by the courier's status mapping; falls back to the status table
   * for manual events, which have no mapping.
   */
  countsAsAttempt?: boolean;
}

/**
 * Identity of an event. Deliberately excludes the description — couriers
 * reword free text between polls, and that must not create a duplicate.
 */
export function buildDedupeKey(event: {
  occurredAt: Date;
  courierStatus?: string | null;
  internalStatus: string;
  location?: string | null;
  source: string;
}): string {
  const parts = [
    event.source,
    (event.courierStatus ?? event.internalStatus).trim().toLowerCase(),
    // Minute precision: the same event re-reported seconds apart is one event.
    event.occurredAt.toISOString().slice(0, 16),
    (event.location ?? "").trim().toLowerCase(),
  ];
  return createHash("sha1").update(parts.join("|")).digest("hex");
}

export interface RecordResult {
  created: number;
  skipped: number;
}

/**
 * Append events to a shipment, ignoring any already recorded.
 *
 * Already-seen keys are filtered out first, and the unique index is the real
 * guarantee: if two syncs race past the filter, the loser's insert fails with
 * P2002 and is treated as "already recorded" rather than as an error.
 */
export async function recordTrackingEvents(
  shipmentId: string,
  events: IncomingEvent[],
): Promise<RecordResult> {
  if (events.length === 0) return { created: 0, skipped: 0 };

  const rows = events.map((event) => ({
    shipmentId,
    occurredAt: event.occurredAt,
    source: event.source,
    courierStatus: event.courierStatus ?? null,
    internalStatus: event.internalStatus,
    location: event.location ?? null,
    description: event.description ?? null,
    notes: event.notes ?? null,
    userId: event.userId ?? null,
    rawPayload: event.rawPayload ?? null,
    countsAsAttempt: event.countsAsAttempt ?? isAttemptStatus(event.internalStatus),
    dedupeKey: buildDedupeKey({ ...event, source: event.source }),
  }));

  // Collapse duplicates inside this batch too — one poll can return the same
  // event twice when a courier re-reports it under two hubs.
  const seen = new Set<string>();
  const unique = rows.filter((row) => {
    if (seen.has(row.dedupeKey)) return false;
    seen.add(row.dedupeKey);
    return true;
  });

  const already = await prisma.trackingEvent.findMany({
    where: { shipmentId, dedupeKey: { in: unique.map((row) => row.dedupeKey) } },
    select: { dedupeKey: true },
  });
  const recorded = new Set(already.map((row) => row.dedupeKey));

  const fresh = unique.filter((row) => !recorded.has(row.dedupeKey));

  let created = 0;
  for (const row of fresh) {
    try {
      await prisma.trackingEvent.create({ data: row });
      created += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another sync recorded it a moment ago. Not an error.
    }
  }

  return { created, skipped: events.length - created };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}

/**
 * Rebuild a shipment's derived fields from its event log, then roll the result
 * up to the order. Safe to call as often as you like.
 */
export async function recomputeShipment(shipmentId: string): Promise<void> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      events: { orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }] },
      attempts: true,
    },
  });
  if (!shipment) return;

  const events = shipment.events;

  if (events.length === 0) {
    await rollUpToOrder(shipment.orderId);
    return;
  }

  // The latest event by time decides the current status; where two events share
  // a timestamp, the one further along the lifecycle wins.
  const latest = [...events].sort((a, b) => {
    const byTime = a.occurredAt.getTime() - b.occurredAt.getTime();
    if (byTime !== 0) return byTime;
    return statusRank(a.internalStatus) - statusRank(b.internalStatus);
  })[events.length - 1];

  const firstWith = (status: string) =>
    events.find((event) => event.internalStatus === status)?.occurredAt ?? null;

  // The flag stored on the event, not a re-lookup — an operator editing the
  // mapping today must not silently rewrite last month's attempt counts.
  const attemptEvents = events.filter((event) => event.countsAsAttempt);

  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      status: latest.internalStatus,
      courierStatus: latest.courierStatus,
      currentLocation: latest.location ?? shipment.currentLocation,
      lastTrackingAt: latest.occurredAt,
      deliveryAttempts: attemptEvents.length,
      pickedUpAt: shipment.pickedUpAt ?? firstWith(ORDER_STATUS.PICKED_UP),
      deliveredAt: firstWith(ORDER_STATUS.DELIVERED),
      returnedAt: firstWith(ORDER_STATUS.RETURNED),
      cancelledAt: firstWith(ORDER_STATUS.CANCELLED),
    },
  });

  await syncDeliveryAttempts(shipmentId, attemptEvents);
  await rollUpToOrder(shipment.orderId);
}

/**
 * Delivery attempts are derived from the events that represent the parcel
 * actually being presented. Keyed on the source event so re-running never
 * double-counts.
 */
async function syncDeliveryAttempts(
  shipmentId: string,
  attemptEvents: {
    id: string;
    occurredAt: Date;
    internalStatus: string;
    courierStatus: string | null;
    location: string | null;
    description: string | null;
    notes: string | null;
    countsAsAttempt: boolean;
  }[],
): Promise<void> {
  const existing = await prisma.deliveryAttempt.findMany({
    where: { shipmentId },
    select: { sourceEventId: true },
  });
  const recorded = new Set(existing.map((row) => row.sourceEventId).filter(Boolean));

  const ordered = [...attemptEvents].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  for (const [index, event] of ordered.entries()) {
    if (recorded.has(event.id)) continue;

    const delivered = event.internalStatus === ORDER_STATUS.DELIVERED;

    await prisma.deliveryAttempt.upsert({
      where: { shipmentId_attemptNumber: { shipmentId, attemptNumber: index + 1 } },
      update: {
        attemptedAt: event.occurredAt,
        outcome: delivered ? "DELIVERED" : "FAILED",
        reason: delivered ? null : (event.courierStatus ?? event.internalStatus),
        courierRemarks: event.description ?? event.notes,
        location: event.location,
        nextAction: delivered ? null : nextActionFor(event.internalStatus),
        sourceEventId: event.id,
      },
      create: {
        shipmentId,
        attemptNumber: index + 1,
        attemptedAt: event.occurredAt,
        outcome: delivered ? "DELIVERED" : "FAILED",
        reason: delivered ? null : (event.courierStatus ?? event.internalStatus),
        courierRemarks: event.description ?? event.notes,
        location: event.location,
        nextAction: delivered ? null : nextActionFor(event.internalStatus),
        sourceEventId: event.id,
      },
    });
  }
}

function nextActionFor(status: string): string {
  switch (status) {
    case ORDER_STATUS.CUSTOMER_NOT_HOME:
      return "Call the customer and agree a delivery window";
    case ORDER_STATUS.CUSTOMER_UNAVAILABLE:
      return "Try an alternate number, then reschedule";
    case ORDER_STATUS.DELIVERY_FAILED:
      return "Confirm the address with the customer";
    case ORDER_STATUS.REFUSED:
      return "Confirm the return and stop chasing delivery";
    default:
      return "Courier will re-attempt";
  }
}

/**
 * An order's status is the furthest-along of its shipments — a split delivery
 * is only "delivered" once the last parcel lands, but a single failure should
 * still surface as an issue.
 */
async function rollUpToOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      shipments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) return;

  const shipments = order.shipments;
  if (shipments.length === 0) return;

  const active = shipments.filter((shipment) => shipment.status !== ORDER_STATUS.CANCELLED);
  const considered = active.length > 0 ? active : shipments;

  // Least-advanced shipment governs: the order is not delivered until all are.
  const governing = considered.reduce((slowest, shipment) =>
    statusRank(shipment.status) < statusRank(slowest.status) ? shipment : slowest,
  );

  // …but an issue on any parcel must be visible.
  const problem = considered.find((shipment) => isIssueStatus(shipment.status));
  const effective = problem ?? governing;

  const totalAttempts = considered.reduce(
    (sum, shipment) => sum + shipment.deliveryAttempts,
    0,
  );
  const lastTracking = considered.reduce<Date | null>(
    (latest, shipment) =>
      shipment.lastTrackingAt && (!latest || shipment.lastTrackingAt > latest)
        ? shipment.lastTrackingAt
        : latest,
    null,
  );

  // A manual status further along than the courier's is not pulled backwards.
  const keepManual =
    order.status !== ORDER_STATUS.NEW &&
    statusRank(order.status) > statusRank(effective.status) &&
    !isIssueStatus(effective.status) &&
    !isTerminalStatus(effective.status);

  const nextStatus = keepManual ? order.status : effective.status;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: nextStatus,
      hasIssue: isIssueStatus(nextStatus),
      issueReason: isIssueStatus(nextStatus)
        ? (effective.courierStatus ?? effective.status)
        : null,
      currentLocation: effective.currentLocation,
      currentStatusAt: effective.lastTrackingAt,
      lastTrackingAt: lastTracking,
      deliveryAttempts: totalAttempts,
      expectedDeliveryAt: effective.expectedDeliveryAt ?? order.expectedDeliveryAt,
      closedAt: isTerminalStatus(nextStatus) ? (order.closedAt ?? new Date()) : null,
    },
  });

  await syncToSale(order.saleId, nextStatus);
}

/**
 * Push the delivery outcome back to the finance record.
 *
 * Without this a parcel the courier returned would keep counting as revenue in
 * the P&L: the finance layer decides what is revenue from the Sale's
 * fulfilment status, and only the courier knows the parcel came back.
 */
async function syncToSale(saleId: string | null, orderStatus: string): Promise<void> {
  if (!saleId) return;

  const mapped = saleStatusFor(orderStatus);
  if (!mapped) return;

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { fulfillmentStatus: true, isCancelled: true },
  });
  if (!sale) return;

  const isCancelled = mapped === "CANCELLED";
  if (sale.fulfillmentStatus === mapped && sale.isCancelled === isCancelled) return;

  await prisma.sale.update({
    where: { id: saleId },
    data: { fulfillmentStatus: mapped, isCancelled },
  });
}

/** Only outcomes the finance side acts on are pushed across. */
function saleStatusFor(orderStatus: string): string | null {
  switch (orderStatus) {
    case ORDER_STATUS.DELIVERED:
      return "FULFILLED";
    case ORDER_STATUS.RETURNED:
    case ORDER_STATUS.REFUSED:
    case ORDER_STATUS.RETURN_IN_TRANSIT:
      return "RETURNED";
    case ORDER_STATUS.CANCELLED:
      return "CANCELLED";
    case ORDER_STATUS.PICKED_UP:
    case ORDER_STATUS.IN_TRANSIT:
    case ORDER_STATUS.ARRIVED_AT_DESTINATION:
    case ORDER_STATUS.OUT_FOR_DELIVERY:
      return "IN_TRANSIT";
    default:
      // Attempt failures are not an outcome yet — the parcel may still land.
      return null;
  }
}

/**
 * Move an order by hand. Recorded as a MANUAL event on the shipment so the
 * courier's own history stays intact and the override is attributable.
 */
export async function applyManualStatus(input: {
  orderId: string;
  status: string;
  userId: string;
  note?: string;
}): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { shipments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!order) throw new Error("That order no longer exists.");

  const now = new Date();
  const shipment = order.shipments[0];

  if (shipment) {
    await recordTrackingEvents(shipment.id, [
      {
        occurredAt: now,
        source: "MANUAL",
        internalStatus: input.status,
        description: "Status set manually",
        notes: input.note ?? null,
        userId: input.userId,
      },
    ]);
    await recomputeShipment(shipment.id);
  }

  // Applied after the roll-up so a manual decision always wins.
  await prisma.order.update({
    where: { id: input.orderId },
    data: {
      status: input.status,
      hasIssue: isIssueStatus(input.status),
      issueReason: isIssueStatus(input.status) ? input.status : null,
      currentStatusAt: now,
      closedAt: isTerminalStatus(input.status) ? (order.closedAt ?? now) : null,
    },
  });
}
