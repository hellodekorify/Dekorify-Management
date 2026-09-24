import { shopifyRoute } from "@/lib/api/shopify-route";
import { paginate, readPageParams } from "@/lib/shopify/admin";
import {
  CUSTOMERS_LIST_QUERY,
  type CustomersListResponse,
  type RawCustomer,
} from "@/lib/shopify/graphql/customers";
import { toCustomer } from "@/lib/shopify/transform";

export const dynamic = "force-dynamic";

/**
 * GET /api/customers
 *
 * Scope: read_customers
 *
 * Customer records are protected data: nothing from them is written to the
 * server log, only the fields the application declares it needs are returned.
 *
 * Query parameters:
 *   limit   1–250, default 50
 *   cursor  endCursor from a previous response
 *   all     1 to walk every page
 *   query   a Shopify search term, e.g. "orders_count:>1"
 */
export const GET = shopifyRoute("GET /api/customers", async ({ connection, url }) => {
  const params = readPageParams(url);
  const search = url.searchParams.get("query") || undefined;

  const page = await paginate<CustomersListResponse, RawCustomer>(
    connection,
    CUSTOMERS_LIST_QUERY,
    { query: search },
    (response) => response.customers,
    params,
  );

  return {
    data: page.items.map(toCustomer),
    meta: {
      count: page.items.length,
      pageInfo: page.pageInfo,
      ...(page.truncated ? { truncated: true } : {}),
    },
  };
});
