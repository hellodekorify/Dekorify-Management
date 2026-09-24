/**
 * The synchronisation engine.
 *
 * Leopards has no webhooks — there is no callback registration endpoint among
 * the four the API exposes — so keeping up to date means polling. Polling is
 * kept proportionate: parcels still moving are checked on the configured
 * interval, parcels that have finished are checked rarely, and a run stops at a
 * configured ceiling so a large backlog cannot turn into a runaway burst of
 * requests.
 *
 * Every run writes a SyncLog row, including failures, so the dashboard can say
 * truthfully when it last heard from Leopards rather than implying freshness.
 */

import { prisma } from "../db";
import { LeopardsError } from "./client";
import { resolveCredentials, LEOPARDS_CODE } from "./courier";
import { readTrackingSettings } from "./settings";
import { fetchTracking, TRACK_BATCH_SIZE, type NormalisedPacket } from "./tracking";

export const SYNC_KIND = "LEOPARDS_TRACKING";

export interface SyncOutcome {
  ok: boolean;
  checked: number;
  updated: number;
  failed: number;
  /** CNs Leopards had no record of. */
  missing: string[];
  message: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
}

export interface SyncOptions {
  storeId: string;
  trigger?: "MANUAL" | "CRON";
  /** Sync exactly these CNs, ignoring whether they are due. */
  only?: string[];
  /** Ignore the interval and sync everything that is due or not. */
  force?: boolean;
}

export async function syncTracking(options: SyncOptions): Promise<SyncOutcome> {
  const { storeId, trigger = "MANUAL", only, force = false } = options;
  const startedAt = new Date();

  const courier = await prisma.courier.findUnique({
    where: { storeId_code: { storeId, code: LEOPARDS_CODE } },
  });

  const credentials = courier ? resolveCredentials(courier) : null;

  if (!credentials) {
    return finish({
      storeId,
      courierId: courier?.id ?? null,
      trigger,
      startedAt,
      ok: false,
      checked: 0,
      updated: 0,
      failed: 0,
      missing: [],
      message:
        "Leopards API credentials are not configured. Add them in Settings → Tracking.",
    });
  }

  const settings = await readTrackingSettings(storeId);
  const due = await selectDueShipments(storeId, { only, force, settings });

  if (due.length === 0) {
    return finish({
      storeId,
      courierId: courier!.id,
      trigger,
      startedAt,
      ok: true,
      checked: 0,
      updated: 0,
      failed: 0,
      missing: [],
      message: "Nothing was due for synchronisation.",
    });
  }

  let updated = 0;
  let failed = 0;
  const missing: string[] = [];
  const errors: string[] = [];

  for (let index = 0; index < due.length; index += TRACK_BATCH_SIZE) {
    const batch = due.slice(index, index + TRACK_BATCH_SIZE);

    try {
      const { packets, missing: notFound } = await fetchTracking(credentials, batch);

      for (const packet of packets) {
        await persistPacket(storeId, packet);
        updated++;
      }

      if (notFound.length > 0) {
        missing.push(...notFound);
        // Record the outcome on the row so the dashboard can explain itself
        // rather than leaving the shipment looking merely stale.
        await prisma.leopardsShipment.updateMany({
          where: { storeId, trackingNumber: { in: notFound } },
          data: {
            lastSyncedAt: new Date(),
            lastSyncError: "Leopards has no record of this tracking number.",
          },
        });
      }
    } catch (error) {
      failed += batch.length;
      const message =
        error instanceof LeopardsError ? error.message : (error as Error).message;
      errors.push(message);

      await prisma.leopardsShipment.updateMany({
        where: { storeId, trackingNumber: { in: batch } },
        data: { lastSyncedAt: new Date(), lastSyncError: message.slice(0, 500) },
      });
    }
  }

  const ok = failed === 0;
  const parts: string[] = [`Checked ${due.length}`, `updated ${updated}`];
  if (missing.length > 0) parts.push(`${missing.length} not found at Leopards`);
  if (failed > 0) parts.push(`${failed} failed`);

  return finish({
    storeId,
    courierId: courier!.id,
    trigger,
    startedAt,
    ok,
    checked: due.length,
    updated,
    failed,
    missing,
    message: errors.length > 0 ? `${parts.join(", ")}. ${errors[0]}` : `${parts.join(", ")}.`,
  });
}

/**
 * Which shipments to ask about.
 *
 * Never-synced first, then the longest-unchecked, so a backlog drains evenly
 * instead of the same rows being refreshed every run.
 */
async function selectDueShipments(
  storeId: string,
  options: {
    only?: string[];
    force: boolean;
    settings: Awaited<ReturnType<typeof readTrackingSettings>>;
  },
): Promise<string[]> {
  const { only, force, settings } = options;

  if (only && only.length > 0) {
    const rows = await prisma.leopardsShipment.findMany({
      where: { storeId, trackingNumber: { in: only.map((cn) => cn.trim().toUpperCase()) } },
      select: { trackingNumber: true },
    });
    return rows.map((row) => row.trackingNumber);
  }

  const now = Date.now();
  const activeCutoff = new Date(now - settings.intervalMinutes * 60_000);
  const terminalCutoff = new Date(now - settings.terminalRecheckHours * 3_600_000);

  const rows = await prisma.leopardsShipment.findMany({
    where: force
      ? { storeId }
      : {
          storeId,
          OR: [
            { lastSyncedAt: null },
            { isTerminal: false, lastSyncedAt: { lt: activeCutoff } },
            { isTerminal: true, lastSyncedAt: { lt: terminalCutoff } },
          ],
        },
    // Nulls sort first on SQLite ascending, which is the priority we want.
    orderBy: [{ lastSyncedAt: "asc" }],
    take: settings.maxPerRun,
    select: { trackingNumber: true },
  });

  return rows.map((row) => row.trackingNumber);
}

/**
 * Write one packet and its events.
 *
 * Events are matched on their fingerprint, so a repeated sync updates rather
 * than duplicates, and an event Leopards later amends is corrected in place.
 */
async function persistPacket(storeId: string, packet: NormalisedPacket): Promise<void> {
  const now = new Date();

  const shipment = await prisma.leopardsShipment.upsert({
    where: { storeId_trackingNumber: { storeId, trackingNumber: packet.trackingNumber } },
    create: {
      storeId,
      trackingNumber: packet.trackingNumber,
      source: "MANUAL",
      ...packetFields(packet, now),
    },
    update: packetFields(packet, now),
    select: { id: true },
  });

  for (const event of packet.events) {
    await prisma.leopardsTrackingEvent.upsert({
      where: {
        shipmentId_fingerprint: { shipmentId: shipment.id, fingerprint: event.fingerprint },
      },
      create: {
        shipmentId: shipment.id,
        fingerprint: event.fingerprint,
        status: event.status,
        statusWithCity: event.statusWithCity,
        location: event.location,
        receiverName: event.receiverName,
        reason: event.reason,
        occurredAt: event.occurredAt,
        rawDate: event.rawDate,
        rawTime: event.rawTime,
        isAttempt: event.isAttempt,
      },
      update: {
        status: event.status,
        statusWithCity: event.statusWithCity,
        location: event.location,
        receiverName: event.receiverName,
        reason: event.reason,
        occurredAt: event.occurredAt,
        isAttempt: event.isAttempt,
      },
    });
  }
}

function packetFields(packet: NormalisedPacket, now: Date) {
  return {
    referenceNumber: packet.referenceNumber,
    packetId: packet.packetId,
    courierStatus: packet.courierStatus,
    status: packet.status,
    isTerminal: packet.isTerminal,
    currentLocation: packet.currentLocation,
    lastEventAt: packet.lastEventAt,
    originCity: packet.originCity,
    originCountry: packet.originCountry,
    destinationCity: packet.destinationCity,
    consigneeName: packet.consigneeName,
    consigneePhone: packet.consigneePhone,
    consigneeEmail: packet.consigneeEmail,
    consigneeAddress: packet.consigneeAddress,
    shipperName: packet.shipperName,
    specialInstructions: packet.specialInstructions,
    statusRemarks: packet.statusRemarks,
    reverseCn: packet.reverseCn,
    weightGrams: packet.weightGrams,
    pieces: packet.pieces,
    codAmount: packet.codAmount,
    bookedAt: packet.bookedAt,
    deliveredAt: packet.deliveredAt,
    deliveryAttempts: packet.deliveryAttempts,
    lastSyncedAt: now,
    lastSyncOkAt: now,
    lastSyncError: null,
    rawResponse: packet.raw.slice(0, 20_000),
  };
}

async function finish(input: {
  storeId: string;
  courierId: string | null;
  trigger: string;
  startedAt: Date;
  ok: boolean;
  checked: number;
  updated: number;
  failed: number;
  missing: string[];
  message: string;
}): Promise<SyncOutcome> {
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - input.startedAt.getTime();

  await prisma.syncLog.create({
    data: {
      storeId: input.storeId,
      courierId: input.courierId,
      kind: SYNC_KIND,
      status: input.ok ? (input.failed > 0 ? "PARTIAL" : "SUCCESS") : "FAILED",
      trigger: input.trigger,
      startedAt: input.startedAt,
      finishedAt,
      durationMs,
      itemsChecked: input.checked,
      itemsUpdated: input.updated,
      itemsFailed: input.failed,
      message: input.message.slice(0, 1000),
      detail: input.missing.length > 0 ? `Not found: ${input.missing.join(", ")}`.slice(0, 2000) : null,
    },
  });

  if (input.courierId) {
    await prisma.courier.update({
      where: { id: input.courierId },
      data: {
        lastSyncAt: finishedAt,
        ...(input.ok ? { lastSyncOkAt: finishedAt, lastSyncError: null } : { lastSyncError: input.message.slice(0, 500) }),
      },
    });
  }

  await prisma.store.update({
    where: { id: input.storeId },
    data: { trackingLastSyncAt: finishedAt },
  });

  return {
    ok: input.ok,
    checked: input.checked,
    updated: input.updated,
    failed: input.failed,
    missing: input.missing,
    message: input.message,
    startedAt: input.startedAt,
    finishedAt,
    durationMs,
  };
}

/** The most recent sync attempt, successful or not. */
export async function lastSync(storeId: string) {
  return prisma.syncLog.findFirst({
    where: { storeId, kind: SYNC_KIND },
    orderBy: { startedAt: "desc" },
  });
}

/** The most recent sync that actually succeeded. */
export async function lastSuccessfulSync(storeId: string) {
  return prisma.syncLog.findFirst({
    where: { storeId, kind: SYNC_KIND, status: { in: ["SUCCESS", "PARTIAL"] } },
    orderBy: { startedAt: "desc" },
  });
}
