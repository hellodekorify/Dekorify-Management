import { prisma } from "../db";

/**
 * Tracking settings, kept in the generic Setting table so no migration is
 * needed to add one. Credentials are deliberately NOT here — they live on the
 * Courier row and in environment variables, and are never sent to the browser.
 */

const KEY = "leopards.tracking";

export interface TrackingSettings {
  /** Minutes between automatic syncs of active shipments. */
  intervalMinutes: number;
  /**
   * Hours between re-checks of shipments that have reached a final status.
   * Leopards occasionally amends a delivered parcel, so they are not abandoned
   * entirely — just checked far less often.
   */
  terminalRecheckHours: number;
  /** Shipments to include in one sync run, across all batches. */
  maxPerRun: number;
  /** Automatic syncing on or off; manual refresh always works. */
  autoSyncEnabled: boolean;
}

export const DEFAULT_TRACKING_SETTINGS: TrackingSettings = {
  intervalMinutes: 30,
  terminalRecheckHours: 24,
  maxPerRun: 200,
  autoSyncEnabled: true,
};

export const INTERVAL_CHOICES = [10, 15, 30, 60, 120, 240] as const;

export async function readTrackingSettings(storeId: string): Promise<TrackingSettings> {
  const row = await prisma.setting.findUnique({
    where: { storeId_key: { storeId, key: KEY } },
  });

  if (!row) return { ...DEFAULT_TRACKING_SETTINGS };

  try {
    const parsed = JSON.parse(row.value) as Partial<TrackingSettings>;
    return {
      intervalMinutes: clamp(parsed.intervalMinutes, 5, 1440, DEFAULT_TRACKING_SETTINGS.intervalMinutes),
      terminalRecheckHours: clamp(
        parsed.terminalRecheckHours,
        1,
        720,
        DEFAULT_TRACKING_SETTINGS.terminalRecheckHours,
      ),
      maxPerRun: clamp(parsed.maxPerRun, 20, 2000, DEFAULT_TRACKING_SETTINGS.maxPerRun),
      autoSyncEnabled: parsed.autoSyncEnabled ?? DEFAULT_TRACKING_SETTINGS.autoSyncEnabled,
    };
  } catch {
    // A corrupted setting should not take the dashboard down with it.
    return { ...DEFAULT_TRACKING_SETTINGS };
  }
}

export async function writeTrackingSettings(
  storeId: string,
  settings: TrackingSettings,
): Promise<void> {
  const value = JSON.stringify(settings);
  await prisma.setting.upsert({
    where: { storeId_key: { storeId, key: KEY } },
    create: { storeId, key: KEY, value },
    update: { value },
  });
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
