import { shopifyRoute } from "@/lib/api/shopify-route";
import { paginate, readPageParams } from "@/lib/shopify/admin";
import {
  COLLECTIONS_LIST_QUERY,
  type CollectionsListResponse,
  type RawCollection,
} from "@/lib/shopify/graphql/collections";
import { toCollection } from "@/lib/shopify/transform";

export const dynamic = "force-dynamic";

/**
 * GET /api/collections
 *
 * Scope: read_products — Collection sits under the products scope.
 *
 * Returns both smart (rule-based) and custom collections, distinguished by
 * the `type` field.
 *
 * Query parameters:
 *   limit   1–250, default 50
 *   cursor  endCursor from a previous response
 *   all     1 to walk every page
 *   query   a Shopify search term, e.g. "title:Sale"
 */
export const GET = shopifyRoute("GET /api/collections", async ({ connection, url }) => {
  const params = readPageParams(url);
  const search = url.searchParams.get("query") || undefined;

  const page = await paginate<CollectionsListResponse, RawCollection>(
    connection,
    COLLECTIONS_LIST_QUERY,
    { query: search },
    (response) => response.collections,
    params,
  );

  return {
    data: page.items.map(toCollection),
    meta: {
      count: page.items.length,
      pageInfo: page.pageInfo,
      ...(page.truncated ? { truncated: true } : {}),
    },
  };
});
