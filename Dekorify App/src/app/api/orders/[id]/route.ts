import { shopifyRoute } from "@/lib/api/shopify-route";
import { shopifyRequest, toGid } from "@/lib/shopify/admin";
import { notFound } from "@/lib/shopify/errors";
import { ORDER_BY_ID_QUERY, type OrderByIdResponse } from "@/lib/shopify/graphql/orders";
import { toOrder } from "@/lib/shopify/transform";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/:id
 *
 * Accepts a numeric id or a full gid://shopify/Order/....
 * Scope: read_orders
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return shopifyRoute("GET /api/orders/:id", async ({ connection }) => {
    const response = await shopifyRequest<OrderByIdResponse>(connection, ORDER_BY_ID_QUERY, {
      id: toGid("Order", id),
    });

    if (!response.order) throw notFound("order", id);

    return { data: toOrder(response.order) };
  })(request);
}
