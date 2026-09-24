import { prisma } from "../db";
import {
  LeopardsError,
  TRACK_BATCH_SIZE,
  bookPacket,
  trackBookedPackets,
  type LeopardsPacket,
} from "./client";
import { resolveCredentials } from "./courier";
import { resolveCourierStatus } from "./status-map";
import { recomputeShipment, recordTrackingEvents, type IncomingEvent } from "../orders/tracking";
import { isTerminalStatus, ORDER_STATUS } from "../orders/statuses";
import { toMajorNumber } from "../money";

/**
 * Leopards has no tracking webhook, so shipments are polled.
 *
 * Only shipments that can still move are polled — a delivered or returned
 * parcel is never asked about again, which is what keeps the poll cheap as the
 * order book grows.
 */

export interface TrackingSyncResult {
  checked: number;
  eventsCreated: number;
  shipmentsUpdated: number;
  failed: number;
  message: string;
  /** False when the sync could not run at all — bad or missing configuration. */
  ok: boolean;
}

const OPEN_STATUSES = [
  ORDER_STATUS.SHIPMENT_CREATED,
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.IN_TRANSIT,
  ORDER_STATUS.ARRIVED_AT_DESTINATION,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERY_ATTEMPTED,
  ORDER_STATUS.CUSTOMER_NOT_HOME,
  ORDER_STATUS.CUSTOMER_UNAVAILABLE,
  ORDER_STATUS.DELIVERY_FAILED,
  ORDER_STATUS.RESCHEDULED,
  ORDER_STATUS.RETURN_REQUESTED,
  ORDER_STATUS.RETURN_IN_TRANSIT,
];

export async function syncTracking(
  storeId: string,
  options: { trigger?: "MANUAL" | "CRON"; limit?: number; shipmentIds?: string[] } = {},
): Promise<TrackingSyncResult> {
  const trigger = options.trigger ?? "MANUAL";

  const courier = await prisma.courier.findUnique({
    where: { storeId_code: { storeId, code: "LEOPARDS" } },
    include: { statusMappings: true },
  });

  if (!courier) {
    return failResult(storeId, null, trigger, "Leopards is not set up for this store yet.");
  }

  const credentials = resolveCredentials(courier);
  if (!credentials) {
    return failResult(
      storeId,
      courier.id,
      trigger,
      "Leopards API credentials are missing. Add them in Settings → Couriers, or set LEOPARDS_API_KEY and LEOPARDS_API_PASSWORD.",
    );
  }

  const log = await prisma.syncLog.create({
    data: { storeId, courierId: courier.id, kind: "LEOPARDS_TRACKING", trigger, status: "RUNNING" },
  });

  const startedAt = Date.now();

  const shipments = await prisma.shipment.findMany({
    where: {
      storeId,
      deletedAt: null,
      trackingNumber: { not: null },
      ...(options.shipmentIds
        ? { id: { in: options.shipmentIds } }
        : { status: { in: OPEN_STATUSES } }),
    },
    // Least-recently-checked first, so nothing is starved when capped.
    orderBy: [{ lastTrackingAt: "asc" }, { createdAt: "asc" }],
    take: options.limit ?? 400,
    select: { id: true, trackingNumber: true },
  });

  if (shipments.length === 0) {
    await finishLog(log.id, "SUCCESS", startedAt, {
      message: "Nothing to check — no open shipments.",
    });
    return {
      checked: 0,
      eventsCreated: 0,
      shipmentsUpdated: 0,
      failed: 0,
      message: "Nothing to check — no open shipments.",
      ok: true,
    };
  }

  const byTrackingNumber = new Map(
    shipments.map((shipment) => [shipment.trackingNumber!.trim().toUpperCase(), shipment.id]),
  );

  const mappings = courier.statusMappings.map((mapping) => ({
    courierStatus: mapping.courierStatus,
    internalStatus: mapping.internalStatus,
    isIssue: mapping.isIssue,
    isAttempt: mapping.isAttempt,
    isTerminal: mapping.isTerminal,
  }));

  let eventsCreated = 0;
  let shipmentsUpdated = 0;
  let failed = 0;
  const unmatchedStatuses = new Set<string>();
  const errors: string[] = [];
  let lastRaw = "";

  const batches = chunk(
    shipments.map((shipment) => shipment.trackingNumber!),
    TRACK_BATCH_SIZE,
  );

  for (const batch of batches) {
    try {
      const { packets, raw } = await trackBookedPackets(credentials, batch);
      lastRaw = raw;

      for (const packet of packets) {
        const shipmentId = byTrackingNumber.get(packet.trackingNumber.trim().toUpperCase());
        if (!shipmentId) continue;

        const events = toIncomingEvents(packet, mappings, unmatchedStatuses);
        if (events.length === 0) continue;

        const { created } = await recordTrackingEvents(shipmentId, events);
        eventsCreated += created;

        if (created > 0) {
          await recomputeShipment(shipmentId);
          shipmentsUpdated += 1;
        } else {
          // Still stamp the check so polling rotates fairly.
          await prisma.shipment.update({
            where: { id: shipmentId },
            data: { lastTrackingAt: undefined, updatedAt: new Date() },
          });
        }
      }
    } catch (error) {
      failed += batch.length;
      const detail =
        error instanceof LeopardsError
          ? `${error.message}${error.detail ? ` — ${error.detail.slice(0, 300)}` : ""}`
          : (error as Error).message;
      errors.push(detail);
      // One bad batch must not abandon the rest of the run.
    }
  }

  const status = failed === 0 ? "SUCCESS" : eventsCreated > 0 ? "PARTIAL" : "FAILED";

  const notes: string[] = [];
  if (unmatchedStatuses.size > 0) {
    notes.push(
      `Unmapped courier statuses (recorded but not moving orders): ${[...unmatchedStatuses]
        .slice(0, 10)
        .join(", ")}`,
    );
  }

  const message =
    failed === 0
      ? `Checked ${shipments.length} shipment${shipments.length === 1 ? "" : "s"}, ${eventsCreated} new tracking event${eventsCreated === 1 ? "" : "s"}.`
      : `Checked ${shipments.length}, ${failed} could not be reached. ${errors[0] ?? ""}`;

  await finishLog(log.id, status, startedAt, {
    checked: shipments.length,
    created: eventsCreated,
    updated: shipmentsUpdated,
    failedCount: failed,
    message,
    detail: [...notes, ...errors.slice(0, 3), lastRaw.slice(0, 1500)].filter(Boolean).join("\n\n"),
  });

  await prisma.courier.update({
    where: { id: courier.id },
    data: {
      lastSyncAt: new Date(),
      ...(failed === 0 ? { lastSyncOkAt: new Date(), lastSyncError: null } : { lastSyncError: errors[0] ?? null }),
    },
  });

  await prisma.store.update({ where: { id: storeId }, data: { trackingLastSyncAt: new Date() } });

  return {
    checked: shipments.length,
    eventsCreated,
    shipmentsUpdated,
    failed,
    message,
    ok: failed === 0,
  };
}

/** Courier events become internal events; unknown wording is kept verbatim. */
function toIncomingEvents(
  packet: LeopardsPacket,
  mappings: Parameters<typeof resolveCourierStatus>[1],
  unmatched: Set<string>,
): IncomingEvent[] {
  const events: IncomingEvent[] = [];

  for (const event of packet.events) {
    if (!event.occurredAt) continue;

    const resolved = resolveCourierStatus(event.status, mappings);
    if (!resolved.matched) unmatched.add(event.status);

    events.push({
      occurredAt: event.occurredAt,
      source: "LEOPARDS",
      internalStatus: resolved.internalStatus,
      courierStatus: event.status,
      location: event.location,
      countsAsAttempt: resolved.isAttempt,
      description: [event.remarks, event.receiverName ? `Received by ${event.receiverName}` : null]
        .filter(Boolean)
        .join(" · ") || null,
    });
  }

  // Some accounts return only a headline status with no detail array.
  if (events.length === 0 && packet.currentStatus) {
    const resolved = resolveCourierStatus(packet.currentStatus, mappings);
    if (!resolved.matched) unmatched.add(packet.currentStatus);

    events.push({
      occurredAt: packet.deliveredAt ?? packet.bookedAt ?? new Date(),
      source: "LEOPARDS",
      internalStatus: resolved.internalStatus,
      courierStatus: packet.currentStatus,
      location: packet.destinationCity,
      countsAsAttempt: resolved.isAttempt,
      description: "Reported without a detailed history",
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export interface BookShipmentResult {
  ok: boolean;
  message: string;
  trackingNumber?: string;
  shipmentId?: string;
}

/**
 * Books an order with Leopards and opens its shipment.
 *
 * Validation happens before the call so the common failures — no phone, no
 * address, no destination city — are reported as something the owner can fix
 * rather than as an opaque courier rejection.
 */
export async function bookShipment(
  storeId: string,
  orderId: string,
  options: { weightGrams?: number; pieces?: number; instructions?: string } = {},
): Promise<BookShipmentResult> {
  const [order, courier, store] = await Promise.all([
    prisma.order.findFirst({
      where: { id: orderId, storeId, deletedAt: null },
      include: { shipments: { where: { deletedAt: null } }, items: true },
    }),
    prisma.courier.findUnique({ where: { storeId_code: { storeId, code: "LEOPARDS" } } }),
    prisma.store.findUnique({ where: { id: storeId } }),
  ]);

  if (!order) return { ok: false, message: "That order no longer exists." };
  if (!courier) return { ok: false, message: "Leopards is not set up for this store." };
  if (!store) return { ok: false, message: "Store not found." };

  const alreadyBooked = order.shipments.find(
    (shipment) => shipment.trackingNumber && shipment.status !== ORDER_STATUS.CANCELLED,
  );
  if (alreadyBooked) {
    return {
      ok: false,
      message: `This order already has CN ${alreadyBooked.trackingNumber}. Cancel that shipment before booking another.`,
    };
  }

  const credentials = resolveCredentials(courier);
  if (!credentials) {
    return {
      ok: false,
      message:
        "Leopards API credentials are missing. Add them in Settings → Couriers, or set LEOPARDS_API_KEY and LEOPARDS_API_PASSWORD.",
    };
  }

  const problems: string[] = [];
  if (!order.customerPhone?.trim()) problems.push("customer phone");
  if (!order.address1?.trim()) problems.push("shipping address");
  if (!order.city?.trim()) problems.push("city");
  if (!courier.originCityId?.trim()) problems.push("origin city (set it in Settings → Couriers)");

  if (problems.length > 0) {
    return { ok: false, message: `Cannot book yet — missing ${problems.join(", ")}.` };
  }

  const destinationCityId = await resolveDestinationCityId(courier.id, order.city!);
  if (!destinationCityId) {
    return {
      ok: false,
      message: `No Leopards city ID is mapped for "${order.city}". Add it in Settings → Couriers.`,
    };
  }

  const log = await prisma.syncLog.create({
    data: { storeId, courierId: courier.id, kind: "LEOPARDS_BOOKING", trigger: "MANUAL", status: "RUNNING" },
  });
  const startedAt = Date.now();

  // COD collects the order total; a prepaid order collects nothing.
  const isCod = (order.paymentMethod ?? "COD").toUpperCase() === "COD";
  const collectAmount = isCod ? Math.round(toMajorNumber(order.totalMinor)) : 0;

  try {
    const result = await bookPacket(credentials, {
      orderId: order.orderNumber,
      weightGrams: options.weightGrams ?? 500,
      pieces: options.pieces ?? Math.max(1, order.items.length),
      collectAmount,
      originCityId: courier.originCityId!,
      destinationCityId,
      shipperName: store.name,
      shipperEmail: process.env.STORE_CONTACT_EMAIL ?? "",
      shipperPhone: process.env.STORE_CONTACT_PHONE ?? "",
      shipperAddress: courier.returnAddress ?? store.name,
      returnAddress: courier.returnAddress ?? store.name,
      consigneeName: order.customerName ?? "Customer",
      consigneeEmail: order.customerEmail ?? "",
      consigneePhone: order.customerPhone!,
      consigneeAddress: [order.address1, order.address2, order.city].filter(Boolean).join(", "),
      specialInstructions: options.instructions,
    });

    const shipment = await prisma.shipment.create({
      data: {
        storeId,
        orderId: order.id,
        courierId: courier.id,
        trackingNumber: result.trackingNumber,
        courierOrderId: order.orderNumber,
        status: ORDER_STATUS.SHIPMENT_CREATED,
        bookedAt: new Date(),
        weightGrams: options.weightGrams ?? 500,
        pieces: options.pieces ?? Math.max(1, order.items.length),
        codAmountMinor: isCod ? order.totalMinor : 0n,
        bookingResponse: result.raw.slice(0, 4000),
        labelUrl: result.slipLink,
      },
    });

    await recordTrackingEvents(shipment.id, [
      {
        occurredAt: new Date(),
        source: "LEOPARDS",
        internalStatus: ORDER_STATUS.SHIPMENT_CREATED,
        courierStatus: "Consignment booked",
        description: `Booked with Leopards — CN ${result.trackingNumber}`,
      },
    ]);
    await recomputeShipment(shipment.id);

    await finishLog(log.id, "SUCCESS", startedAt, {
      checked: 1,
      created: 1,
      message: `Booked CN ${result.trackingNumber} for ${order.orderNumber}`,
      detail: result.raw.slice(0, 1500),
    });

    return {
      ok: true,
      message: `Shipment booked. CN ${result.trackingNumber}.`,
      trackingNumber: result.trackingNumber,
      shipmentId: shipment.id,
    };
  } catch (error) {
    const detail =
      error instanceof LeopardsError
        ? `${error.message}${error.detail ? ` — ${error.detail.slice(0, 500)}` : ""}`
        : (error as Error).message;

    await finishLog(log.id, "FAILED", startedAt, {
      checked: 1,
      failedCount: 1,
      message: `Booking failed for ${order.orderNumber}`,
      detail,
    });

    return { ok: false, message: detail };
  }
}

/**
 * City name to Leopards city ID.
 *
 * Stored as status mappings under a reserved prefix so the mapping is editable
 * in the same place as everything else, without another table.
 */
export const CITY_MAPPING_PREFIX = "city:";

async function resolveDestinationCityId(
  courierId: string,
  cityName: string,
): Promise<string | null> {
  const needle = `${CITY_MAPPING_PREFIX}${cityName.trim().toLowerCase()}`;
  const mapping = await prisma.courierStatusMapping.findUnique({
    where: { courierId_courierStatus: { courierId, courierStatus: needle } },
  });
  return mapping?.internalStatus ?? null;
}

// ---------------------------------------------------------------------------

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/**
 * A sync that could not start is logged, not swallowed. A scheduled job
 * quietly reporting "0 checked" for weeks is how people discover far too late
 * that nothing was ever syncing.
 */
async function failResult(
  storeId: string,
  courierId: string | null,
  trigger: string,
  message: string,
): Promise<TrackingSyncResult> {
  await prisma.syncLog.create({
    data: {
      storeId,
      courierId,
      kind: "LEOPARDS_TRACKING",
      trigger,
      status: "FAILED",
      finishedAt: new Date(),
      durationMs: 0,
      message,
    },
  });

  return { checked: 0, eventsCreated: 0, shipmentsUpdated: 0, failed: 0, message, ok: false };
}

async function finishLog(
  id: string,
  status: string,
  startedAt: number,
  data: {
    checked?: number;
    created?: number;
    updated?: number;
    failedCount?: number;
    message?: string;
    detail?: string;
  },
): Promise<void> {
  await prisma.syncLog.update({
    where: { id },
    data: {
      status,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
      itemsChecked: data.checked ?? 0,
      itemsCreated: data.created ?? 0,
      itemsUpdated: data.updated ?? 0,
      itemsFailed: data.failedCount ?? 0,
      message: data.message,
      detail: data.detail?.slice(0, 6000),
    },
  });
}

export { isTerminalStatus };
