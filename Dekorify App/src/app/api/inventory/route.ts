import { shopifyRoute } from "@/lib/api/shopify-route";
import { paginate, readPageParams } from "@/lib/shopify/admin";
import {
  INVENTORY_LIST_QUERY,
  type InventoryListResponse,
  type RawInventoryItem,
} from "@/lib/shopify/graphql/inventory";
import { toInventoryItem } from "@/lib/shopify/transform";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventory
 *
 * Scope: read_inventory for the levels, read_locations to name each location.
 *
 * Walks inventory items rather than products, so a store with many variants
 * per product still paginates evenly.
 *
 * Query parameters:
 *   limit   1–250, default 50
 *   cursor  endCursor from a previous response
 *   all     1 to walk every page
 *   query   a Shopify search term, e.g. "sku:DK-TL-BLK"
 */
export const GET = shopifyRoute("GET /api/inventory", async ({ connection, url }) => {
  const params = readPageParams(url);
  const search = url.searchParams.get("query") || undefined;

  const page = await paginate<InventoryListResponse, RawInventoryItem>(
    connection,
    INVENTORY_LIST_QUERY,
    { query: search },
    (response) => response.inventoryItems,
    params,
  );

  return {
    data: page.items.map(toInventoryItem),
    meta: {
      count: page.items.length,
      pageInfo: page.pageInfo,
      ...(page.truncated ? { truncated: true } : {}),
    },
  };
});
