import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { readTrackingSettings } from "@/lib/leopards/settings";
import { syncTracking } from "@/lib/leopards/sync-tracking";

/**
 * Scheduled Leopards polling.
 *
 * Leopards publishes no webhook registration endpoint, so this is how the
 * dashboard stays current. Point a scheduler at it — Windows Task Scheduler,
 * cron, or a hosting platform's own — at or below the configured interval; the
 * engine itself decides which parcels are actually due, so calling it more
 * often than necessary costs nothing extra at Leopards.
 *
 *   curl -X POST http://localhost:3000/api/tracking/sync \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Deliberately touches nothing but Leopards: no Shopify call is made here, and
 * the route works with Shopify entirely disconnected.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const supplied = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  // Compare only when the lengths match: timingSafeEqual throws otherwise.
  if (supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorised. Set CRON_SECRET and send it as a Bearer token." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  // Lets a person force a run past the "automatic sync off" switch.
  const force = url.searchParams.get("force") === "1";

  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const results: Record<string, unknown>[] = [];

  for (const store of stores) {
    const settings = await readTrackingSettings(store.id);

    if (!settings.autoSyncEnabled && !force) {
      results.push({ store: store.name, skipped: "automatic synchronisation is off" });
      continue;
    }

    try {
      const outcome = await syncTracking({ storeId: store.id, trigger: "CRON" });
      results.push({
        store: store.name,
        ok: outcome.ok,
        checked: outcome.checked,
        updated: outcome.updated,
        failed: outcome.failed,
        missing: outcome.missing.length,
        durationMs: outcome.durationMs,
        message: outcome.message,
      });
    } catch (error) {
      // One store's failure must not stop the others.
      results.push({ store: store.name, ok: false, error: (error as Error).message });
    }
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
