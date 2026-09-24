"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { verifyCredentials } from "@/lib/leopards/client";
import {
  ensureLeopardsCourier,
  LEOPARDS_CODE,
  resolveCredentials,
} from "@/lib/leopards/courier";
import { addTrackingNumbers, parseTrackingNumbers, removeShipment } from "@/lib/leopards/intake";
import {
  DEFAULT_TRACKING_SETTINGS,
  readTrackingSettings,
  writeTrackingSettings,
} from "@/lib/leopards/settings";
import { syncTracking } from "@/lib/leopards/sync-tracking";
import { prisma } from "@/lib/db";

export interface TrackingActionResult {
  ok: boolean;
  message: string;
  detail?: string;
}

/**
 * Refresh now.
 *
 * `force` bypasses the interval, because a person pressing Refresh has asked
 * for the latest, not for whatever the schedule thinks is due.
 */
export async function refreshTrackingAction(
  trackingNumber?: string,
): Promise<TrackingActionResult> {
  const { store } = await requireContext();

  try {
    const outcome = await syncTracking({
      storeId: store.id,
      trigger: "MANUAL",
      force: !trackingNumber,
      only: trackingNumber ? [trackingNumber] : undefined,
    });

    revalidatePath("/tracking");
    if (trackingNumber) revalidatePath(`/tracking/${trackingNumber}`);

    return {
      ok: outcome.ok,
      message: outcome.message,
      detail:
        outcome.missing.length > 0
          ? `Leopards has no record of: ${outcome.missing.join(", ")}`
          : undefined,
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function addShipmentsAction(
  _prev: TrackingActionResult | null,
  formData: FormData,
): Promise<TrackingActionResult> {
  const { store } = await requireContext();

  const parsed = z
    .object({ numbers: z.string().trim().min(1, "Enter at least one tracking number.") })
    .safeParse({ numbers: formData.get("numbers") });

  if (!parsed.success) {
    return { ok: false, message: "Enter at least one tracking number." };
  }

  const candidates = parseTrackingNumbers(parsed.data.numbers);
  if (candidates.length === 0) {
    return { ok: false, message: "No tracking numbers could be read from that." };
  }

  const result = await addTrackingNumbers(store.id, candidates, "CSV");

  if (result.added.length === 0) {
    return {
      ok: false,
      message:
        result.duplicates.length > 0
          ? "Every one of those is already being tracked."
          : "None of those looked like a tracking number.",
      detail: result.rejected.map((entry) => entry.value).join(", ") || undefined,
    };
  }

  // Fetch them straight away: an added CN with no data yet is not useful.
  const outcome = await syncTracking({
    storeId: store.id,
    trigger: "MANUAL",
    only: result.added,
  });

  revalidatePath("/tracking");

  const parts = [`Added ${result.added.length}`];
  if (result.duplicates.length > 0) parts.push(`${result.duplicates.length} already tracked`);
  if (result.rejected.length > 0) parts.push(`${result.rejected.length} rejected`);
  if (outcome.missing.length > 0) parts.push(`${outcome.missing.length} unknown to Leopards`);

  return { ok: true, message: `${parts.join(", ")}.` };
}

export async function removeShipmentAction(trackingNumber: string): Promise<TrackingActionResult> {
  const { store } = await requireContext();
  const removed = await removeShipment(store.id, trackingNumber.toUpperCase());
  revalidatePath("/tracking");
  return removed
    ? { ok: true, message: `${trackingNumber} is no longer tracked.` }
    : { ok: false, message: "That shipment was not found." };
}

export async function saveTrackingSettingsAction(
  _prev: TrackingActionResult | null,
  formData: FormData,
): Promise<TrackingActionResult> {
  const { store } = await requireContext();

  const parsed = z
    .object({
      intervalMinutes: z.coerce.number().int().min(5).max(1440),
      terminalRecheckHours: z.coerce.number().int().min(1).max(720),
      maxPerRun: z.coerce.number().int().min(20).max(2000),
      autoSyncEnabled: z.coerce.boolean(),
    })
    .safeParse({
      intervalMinutes: formData.get("intervalMinutes"),
      terminalRecheckHours: formData.get("terminalRecheckHours"),
      maxPerRun: formData.get("maxPerRun"),
      autoSyncEnabled: formData.get("autoSyncEnabled") === "on",
    });

  if (!parsed.success) {
    return { ok: false, message: "Those settings are out of range." };
  }

  await writeTrackingSettings(store.id, parsed.data);
  revalidatePath("/settings/tracking");
  return { ok: true, message: "Synchronisation settings saved." };
}

export async function saveCredentialsAction(
  _prev: TrackingActionResult | null,
  formData: FormData,
): Promise<TrackingActionResult> {
  const { store } = await requireContext();

  const parsed = z
    .object({
      apiKey: z.string().trim().min(1, "API key is required."),
      apiPassword: z.string().trim().min(1, "API password is required."),
      environment: z.enum(["production", "staging"]),
      originCityId: z.string().trim().optional(),
    })
    .safeParse({
      apiKey: formData.get("apiKey"),
      apiPassword: formData.get("apiPassword"),
      environment: formData.get("environment") ?? "production",
      originCityId: formData.get("originCityId") ?? "",
    });

  if (!parsed.success) {
    return { ok: false, message: "Enter both the API key and password." };
  }

  const courierId = await ensureLeopardsCourier(store.id);

  await prisma.courier.update({
    where: { id: courierId },
    data: {
      apiKey: parsed.data.apiKey,
      apiPassword: parsed.data.apiPassword,
      apiEnvironment: parsed.data.environment,
      originCityId: parsed.data.originCityId || null,
    },
  });

  revalidatePath("/settings/tracking");
  return { ok: true, message: "Leopards credentials saved. Test the connection to confirm them." };
}

/** Cheapest authenticated call Leopards offers, used as a connection test. */
export async function testConnectionAction(): Promise<TrackingActionResult> {
  const { store } = await requireContext();

  const courier = await prisma.courier.findUnique({
    where: { storeId_code: { storeId: store.id, code: LEOPARDS_CODE } },
  });

  if (!courier) {
    return { ok: false, message: "Leopards is not set up for this store yet." };
  }

  const credentials = resolveCredentials(courier);
  if (!credentials) {
    return { ok: false, message: "No API key and password are configured." };
  }

  const result = await verifyCredentials(credentials);
  return result.ok
    ? {
        ok: true,
        message: `Connected to Leopards (${credentials.environment}).`,
        detail: `${result.cityCount} cities returned.`,
      }
    : { ok: false, message: result.message };
}

export async function resetTrackingSettingsAction(): Promise<TrackingActionResult> {
  const { store } = await requireContext();
  await writeTrackingSettings(store.id, DEFAULT_TRACKING_SETTINGS);
  revalidatePath("/settings/tracking");
  return { ok: true, message: "Settings restored to their defaults." };
}

export async function currentTrackingSettings() {
  const { store } = await requireContext();
  return readTrackingSettings(store.id);
}
