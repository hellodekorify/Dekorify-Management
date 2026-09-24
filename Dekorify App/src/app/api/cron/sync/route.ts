import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { syncTracking } from "@/lib/leopards/sync";
import { syncShopifyStore } from "@/lib/shopify/sync";

/**
 * Scheduled synchronisation.
 *
 * Called on a timer by whatever scheduler you prefer — Windows Task Scheduler,
 * cron, or a hosting platform's cron. It authenticates with a shared secret
 * rather than a user session, because no user is present.
 *
 *   curl -X POST http://localhost:3000/api/cron/sync \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Runs for every connected store. Tracking always runs; Shopify order pull
 * runs too unless ?tracking=only, so a frequent tracking poll can be paired
 * with a slower order pull.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const supplied = header.replace(/^Bearer\s+/i, "").trim();
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
  const trackingOnly = url.searchParams.get("tracking") === "only";
  const limit = Number(url.searchParams.get("limit") ?? "300") || 300;

  const stores = await prisma.store.findMany({ select: { id: true, name: true, shopifyDomain: true } });

  const results: Record<string, unknown>[] = [];
  let allOk = true;

  for (const store of stores) {
    const entry: Record<string, unknown> = { store: store.name };

    // Shopify first, so a newly imported order can be tracked in the same run.
    if (!trackingOnly && store.shopifyDomain) {
      try {
        const shopify = await syncShopifyStore(store.id, { includeProducts: false });
        entry.shopify = {
          ordersCreated: shopify.ordersCreated,
          ordersUpdated: shopify.ordersUpdated,
          trackedOrdersCreated: shopify.trackedOrdersCreated,
        };
      } catch (error) {
        entry.shopifyError = (error as Error).message;
      }
    }

    try {
      const tracking = await syncTracking(store.id, { trigger: "CRON", limit });
      entry.tracking = {
        ok: tracking.ok,
        checked: tracking.checked,
        eventsCreated: tracking.eventsCreated,
        failed: tracking.failed,
        // Always included: "0 checked" with no explanation is indistinguishable
        // from a healthy run with nothing to do.
        message: tracking.message,
      };
      if (!tracking.ok) allOk = false;
    } catch (error) {
      entry.trackingError = (error as Error).message;
      allOk = false;
    }

    results.push(entry);
  }

  return NextResponse.json(
    { ok: allOk, ranAt: new Date().toISOString(), results },
    // A non-200 lets a scheduler's own alerting notice a broken sync.
    { status: allOk ? 200 : 207 },
  );
}

/** GET is allowed too, for schedulers that cannot send a POST. */
export async function GET(request: Request) {
  return POST(request);
}
