import { prisma } from "../db";
import { normaliseShopDomain } from "./config";
import { SHOP_INFO_QUERY, shopifyGraphQL, type ShopInfo } from "./client";
import { ensureLeopardsCourier } from "../leopards/courier";

/**
 * Connects a store to Shopify from environment variables, so a deployment can
 * be wired up entirely from its host's settings (e.g. Railway) without anyone
 * pasting a token into the browser or running the OAuth round trip.
 *
 * Reads SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN. When both are set and
 * the store is not already connected with that exact token, the token is
 * validated against the Admin API once and then written to the Store row — the
 * same fields `connectShopifyWithTokenAction` writes. A no-op when the env vars
 * are absent, so it is safe to call on every request.
 *
 * Throttled per store so a burst of requests validates the token at most once a
 * minute; a bad token therefore fails loudly in the sync/log rather than on
 * every single page load.
 */

const lastAttempt = new Map<string, number>();
const RETRY_INTERVAL_MS = 60_000;

export async function ensureShopifyFromEnv(storeId: string): Promise<void> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (!domain || !token) return;

  const shop = normaliseShopDomain(domain);
  if (!shop) return;

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { shopifyDomain: true, shopifyAccessToken: true },
  });
  if (!store) return;

  // Already connected with this exact token — nothing to do.
  if (store.shopifyDomain === shop && store.shopifyAccessToken === token) return;

  const since = lastAttempt.get(storeId);
  if (since && Date.now() - since < RETRY_INTERVAL_MS) return;
  lastAttempt.set(storeId, Date.now());

  // Validate before storing, so a wrong token fails here, not silently later.
  try {
    await shopifyGraphQL<ShopInfo>(shop, token, SHOP_INFO_QUERY);
  } catch {
    // Leave the store as-is; the integration reports itself unconnected and the
    // user can see the token is being rejected. Do not throw — a bad env var
    // must not take down every page that happens to touch Shopify.
    return;
  }

  await prisma.store.update({
    where: { id: storeId },
    data: {
      shopifyDomain: shop,
      shopifyAccessToken: token,
      shopifyScope: "custom-app-env",
      shopifyConnectedAt: new Date(),
    },
  });

  await ensureLeopardsCourier(storeId);
}
