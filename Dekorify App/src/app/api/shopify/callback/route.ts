import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentStore, getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  OAUTH_SHOP_COOKIE,
  OAUTH_STATE_COOKIE,
  normaliseShopDomain,
  publicAppUrl,
  readShopifyConfig,
} from "@/lib/shopify/config";
import { exchangeCodeForToken, verifyCallbackHmac } from "@/lib/shopify/oauth";
import { SHOP_INFO_QUERY, shopifyGraphQL, type ShopInfo } from "@/lib/shopify/client";
import { registerWebhooks } from "@/lib/shopify/webhooks";
import { ensureLeopardsCourier } from "@/lib/leopards/courier";
import { safeEqual } from "@/lib/auth";

// Redirects must use the public app URL, never the request's own URL: behind
// Railway's proxy the latter is the internal bind host (0.0.0.0:$PORT), which
// the browser cannot reach.
function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, publicAppUrl()));
}

function fail(reason: string) {
  return redirectTo(`/settings/shopify?error=${reason}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const config = readShopifyConfig();
  if (!config) return fail("not_configured");

  const user = await getCurrentUser();
  if (!user) return redirectTo("/login");

  const store = await getCurrentStore(user.id);
  if (!store) return redirectTo("/settings/new-store");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const expectedShop = cookieStore.get(OAUTH_SHOP_COOKIE)?.value;

  cookieStore.delete(OAUTH_STATE_COOKIE);
  cookieStore.delete(OAUTH_SHOP_COOKIE);

  const state = params.get("state");
  if (!expectedState || !state || !safeEqual(expectedState, state)) {
    return fail("state_mismatch");
  }

  // Signature check before anything else is trusted.
  if (!verifyCallbackHmac(params, config.apiSecret)) {
    return fail("bad_signature");
  }

  const shop = normaliseShopDomain(params.get("shop") ?? "");
  if (!shop || shop !== expectedShop) return fail("invalid_shop");

  const code = params.get("code");
  if (!code) return fail("missing_code");

  try {
    const { access_token, scope } = await exchangeCodeForToken(shop, code);

    // Confirm the token works, and pick up the shop's own currency and timezone.
    const info = await shopifyGraphQL<ShopInfo>(shop, access_token, SHOP_INFO_QUERY);

    await prisma.store.update({
      where: { id: store.id },
      data: {
        shopifyDomain: shop,
        shopifyAccessToken: access_token,
        shopifyScope: scope,
        shopifyConnectedAt: new Date(),
      },
    });

    await recordAudit({
      storeId: store.id,
      userId: user.id,
      entity: "Store",
      entityId: store.id,
      action: "UPDATE",
      summary: `Connected Shopify store ${info.shop.myshopifyDomain}`,
    });

    // Leopards is set up at the same time so the tracking module is usable
    // immediately, with its default status mappings in place.
    await ensureLeopardsCourier(store.id);

    // Webhooks need a publicly reachable app URL. On localhost they will fail,
    // which is expected — the connection itself must not fail with them.
    let webhookNote = "";
    try {
      const registration = await registerWebhooks(shop, access_token);
      webhookNote =
        registration.failed.length > 0
          ? `&webhooks=partial&registered=${registration.registered.length}`
          : `&webhooks=ok&registered=${registration.registered.length + registration.alreadyPresent.length}`;

      await recordAudit({
        storeId: store.id,
        userId: user.id,
        entity: "Store",
        entityId: store.id,
        action: "UPDATE",
        summary: `Shopify webhooks: ${registration.registered.length} registered, ${registration.alreadyPresent.length} already present, ${registration.failed.length} failed`,
        after: registration,
      });
    } catch (error) {
      webhookNote = "&webhooks=failed";
      console.error("Webhook registration failed:", error);
    }

    return redirectTo(`/settings/shopify?connected=1${webhookNote}`);
  } catch (error) {
    console.error("Shopify OAuth callback failed:", error);
    return fail("exchange_failed");
  }
}
