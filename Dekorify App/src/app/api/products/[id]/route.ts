import { shopifyRoute } from "@/lib/api/shopify-route";
import { shopifyRequest, toGid } from "@/lib/shopify/admin";
import { notFound } from "@/lib/shopify/errors";
import {
  PRODUCT_BY_ID_QUERY,
  type ProductByIdResponse,
} from "@/lib/shopify/graphql/products";
import { SHOP_QUERY, type ShopQueryResponse } from "@/lib/shopify/graphql/shop";
import { toProduct } from "@/lib/shopify/transform";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/:id
 *
 * Accepts either a numeric id (8471...) or a full gid://shopify/Product/8471.
 * Scope: read_products
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return shopifyRoute("GET /api/products/:id", async ({ connection }) => {
    const gid = toGid("Product", id);

    const [shop, response] = await Promise.all([
      shopifyRequest<ShopQueryResponse>(connection, SHOP_QUERY),
      shopifyRequest<ProductByIdResponse>(connection, PRODUCT_BY_ID_QUERY, { id: gid }),
    ]);

    // Shopify answers an unknown id with null rather than an error.
    if (!response.product) throw notFound("product", id);

    return { data: toProduct(response.product, shop.shop.currencyCode) };
  })(request);
}
