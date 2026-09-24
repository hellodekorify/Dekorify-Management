import { shopifyRoute } from "@/lib/api/shopify-route";
import { paginate, readPageParams, shopifyRequest } from "@/lib/shopify/admin";
import {
  PRODUCTS_LIST_QUERY,
  type ProductsListResponse,
  type RawProduct,
} from "@/lib/shopify/graphql/products";
import { SHOP_QUERY, type ShopQueryResponse } from "@/lib/shopify/graphql/shop";
import { toProduct } from "@/lib/shopify/transform";

export const dynamic = "force-dynamic";

/**
 * GET /api/products
 *
 * Scope: read_products
 *
 * Query parameters:
 *   limit   1–250, default 50
 *   cursor  endCursor from a previous response
 *   all     1 to walk every page
 *   query   a Shopify search term, e.g. "status:active vendor:Acme"
 */
export const GET = shopifyRoute("GET /api/products", async ({ connection, url }) => {
  const params = readPageParams(url);
  const search = url.searchParams.get("query") || undefined;

  // Variant prices arrive without a currency, so the shop's is fetched to
  // label them correctly rather than assuming one.
  const shop = await shopifyRequest<ShopQueryResponse>(connection, SHOP_QUERY);
  const currency = shop.shop.currencyCode;

  const page = await paginate<ProductsListResponse, RawProduct>(
    connection,
    PRODUCTS_LIST_QUERY,
    { query: search },
    (response) => response.products,
    params,
  );

  return {
    data: page.items.map((product) => toProduct(product, currency)),
    meta: {
      count: page.items.length,
      pageInfo: page.pageInfo,
      ...(page.truncated ? { truncated: true } : {}),
    },
  };
});
