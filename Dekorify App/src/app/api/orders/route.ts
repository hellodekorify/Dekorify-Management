import { shopifyRoute } from "@/lib/api/shopify-route";
import { paginate, readPageParams } from "@/lib/shopify/admin";
import {
  ORDERS_LIST_QUERY,
  type OrdersListResponse,
  type RawOrder,
} from "@/lib/shopify/graphql/orders";
import { toOrder } from "@/lib/shopify/transform";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders
 *
 * Scope: read_orders, plus read_all_orders for anything older than 60 days.
 *
 * Query parameters:
 *   limit   1–250, default 50
 *   cursor  endCursor from a previous response
 *   all     1 to walk every page
 *   query   a Shopify search term, e.g. "created_at:>=2026-01-01 financial_status:paid"
 */
export const GET = shopifyRoute("GET /api/orders", async ({ connection, url }) => {
  const params = readPageParams(url);
  const search = url.searchParams.get("query") || undefined;

  const page = await paginate<OrdersListResponse, RawOrder>(
    connection,
    ORDERS_LIST_QUERY,
    { query: search },
    (response) => response.orders,
    params,
  );

  return {
    data: page.items.map(toOrder),
    meta: {
      count: page.items.length,
      pageInfo: page.pageInfo,
      ...(page.truncated ? { truncated: true } : {}),
      // Worth saying plainly: without read_all_orders Shopify silently caps the
      // window at 60 days, which is easy to mistake for "no older orders".
      note: "Orders older than 60 days require the read_all_orders scope.",
    },
  };
});
