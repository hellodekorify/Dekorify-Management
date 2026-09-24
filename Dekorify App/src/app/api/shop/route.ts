import { shopifyRoute } from "@/lib/api/shopify-route";
import { shopifyRequest } from "@/lib/shopify/admin";
import { SHOP_QUERY, type ShopQueryResponse } from "@/lib/shopify/graphql/shop";
import { toShop } from "@/lib/shopify/transform";

export const dynamic = "force-dynamic";

/**
 * GET /api/shop
 *
 * Shop name, domains, contact email, currency and timezone.
 * Scope: none beyond a valid Admin API token.
 */
export const GET = shopifyRoute("GET /api/shop", async ({ connection }) => {
  const response = await shopifyRequest<ShopQueryResponse>(connection, SHOP_QUERY);
  return { data: toShop(response) };
});
