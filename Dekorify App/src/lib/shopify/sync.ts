import { prisma } from "../db";
import { parseMoney, FX_IDENTITY } from "../money";
import { upsertOrderFromShopify } from "../orders/from-shopify";
import {
  ORDERS_QUERY,
  PRODUCTS_QUERY,
  shopifyGraphQL,
  type OrdersResponse,
  type ProductsResponse,
  type ShopifyOrderNode,
} from "./client";

export interface SyncResult {
  ordersCreated: number;
  ordersUpdated: number;
  productsCreated: number;
  productsUpdated: number;
  /** Operational Order records, which drive the tracking module. */
  trackedOrdersCreated: number;
  trackedOrdersUpdated: number;
  from: Date;
  to: Date;
}

/**
 * Pulls orders and products from Shopify into the local tables.
 *
 * Orders are matched on their Shopify order name (`#1001`), so running the
 * sync twice updates the existing rows rather than doubling revenue. Only
 * orders created since the last successful sync are fetched.
 */
export async function syncShopifyStore(
  storeId: string,
  options: { since?: Date; includeProducts?: boolean; includeOrders?: boolean } = {},
): Promise<SyncResult> {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });

  if (!store.shopifyDomain || !store.shopifyAccessToken) {
    throw new Error("This store is not connected to Shopify.");
  }

  const shop = store.shopifyDomain;
  const token = store.shopifyAccessToken;

  // Default to a small overlap with the last sync so an order edited just after
  // the cutoff is still picked up.
  const since =
    options.since ??
    (store.shopifyLastSyncAt
      ? new Date(store.shopifyLastSyncAt.getTime() - 3 * 86_400_000)
      : new Date(Date.now() - 365 * 86_400_000));

  const to = new Date();

  const result: SyncResult = {
    ordersCreated: 0,
    ordersUpdated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    trackedOrdersCreated: 0,
    trackedOrdersUpdated: 0,
    from: since,
    to,
  };

  const syncedOrders = options.includeOrders !== false;

  if (syncedOrders) {
    await syncOrders(storeId, shop, token, since, result);
  }

  if (options.includeProducts !== false) {
    await syncProducts(storeId, shop, token, result);
  }

  // Only an order sync may move the watermark. A catalogue-only refresh that
  // advanced it would make the next order sync skip everything in between.
  if (syncedOrders) {
    await prisma.store.update({
      where: { id: storeId },
      data: { shopifyLastSyncAt: to },
    });
  }

  return result;
}

/**
 * Refreshes the product catalogue on its own, without touching orders.
 *
 * Pulling a year of orders just to re-read prices is slow and needless, so the
 * Products page uses this rather than the full sync.
 */
export async function syncShopifyProducts(storeId: string): Promise<SyncResult> {
  return syncShopifyStore(storeId, { includeOrders: false, includeProducts: true });
}

async function syncOrders(
  storeId: string,
  shop: string,
  token: string,
  since: Date,
  result: SyncResult,
): Promise<void> {
  let cursor: string | null = null;
  let pages = 0;

  do {
    const response: OrdersResponse = await shopifyGraphQL<OrdersResponse>(
      shop,
      token,
      ORDERS_QUERY,
      { cursor, query: `created_at:>='${since.toISOString()}'` },
    );

    for (const node of response.orders.nodes) {
      const mapped = mapOrder(storeId, node);

      const existing = await prisma.sale.findFirst({
        where: { storeId, orderId: mapped.orderId, deletedAt: null },
        select: { id: true },
      });

      let saleId: string;
      if (existing) {
        await prisma.sale.update({ where: { id: existing.id }, data: mapped });
        saleId = existing.id;
        result.ordersUpdated += 1;
      } else {
        const created = await prisma.sale.create({ data: mapped });
        saleId = created.id;
        result.ordersCreated += 1;
      }

      // The operational record. A failure here must not lose the finance row,
      // so it is reported rather than allowed to abort the whole sync.
      try {
        const tracked = await upsertOrderFromShopify(storeId, node, saleId);
        if (tracked.created) result.trackedOrdersCreated += 1;
        else result.trackedOrdersUpdated += 1;
      } catch (error) {
        console.error(`Order tracking upsert failed for ${node.name}:`, error);
      }
    }

    cursor = response.orders.pageInfo.hasNextPage ? response.orders.pageInfo.endCursor : null;
    pages += 1;
  } while (cursor && pages < 200);
}

/** One Sale row per order, summarising its line items. */
function mapOrder(storeId: string, node: ShopifyOrderNode) {
  const amount = (value: string | null | undefined) => parseMoney(value ?? "0") ?? 0n;

  const gross = amount(node.currentSubtotalPriceSet?.shopMoney.amount);
  const discount = amount(node.currentTotalDiscountsSet?.shopMoney.amount);
  const refund = amount(node.totalRefundedSet?.shopMoney.amount);
  const shipping = amount(node.totalShippingPriceSet?.shopMoney.amount);

  const isCancelled = node.cancelledAt !== null;
  const fulfillmentStatus = mapFulfilment(node.displayFulfillmentStatus, isCancelled);
  const earnsRevenue = !isCancelled && fulfillmentStatus !== "RETURNED";

  const lineItems = node.lineItems.nodes;
  const quantity = lineItems.reduce((total, item) => total + item.quantity, 0);

  // The line the order is filed under is its largest by value, which is the
  // most useful single label for a multi-item order.
  const primary = [...lineItems].sort(
    (a, b) =>
      Number(b.originalTotalSet?.shopMoney.amount ?? 0) -
      Number(a.originalTotalSet?.shopMoney.amount ?? 0),
  )[0];

  const netRevenue = earnsRevenue ? gross - discount - refund + shipping : 0n;

  return {
    storeId,
    date: new Date(node.createdAt),
    orderId: node.name,
    customerName: node.customer?.displayName ?? null,
    channel: "Shopify",
    productName:
      lineItems.length > 1
        ? `${primary?.title ?? "Order"} +${lineItems.length - 1} more`
        : (primary?.title ?? null),
    sku: lineItems.length === 1 ? (primary?.sku ?? null) : null,
    quantity: Math.max(1, quantity),
    grossAmountMinor: gross,
    discountMinor: discount,
    refundMinor: refund,
    shippingRevenueMinor: shipping,
    paymentFeeMinor: 0n,
    netRevenueMinor: netRevenue,
    currency: node.currentSubtotalPriceSet?.shopMoney.currencyCode ?? "PKR",
    fxRateE8: FX_IDENTITY,
    baseNetRevenueMinor: netRevenue,
    financialStatus: mapFinancial(node.displayFinancialStatus),
    fulfillmentStatus,
    isCancelled,
    notes: node.note ?? null,
    shopifyOrderGid: node.id,
  };
}

function mapFulfilment(status: string | null, cancelled: boolean): string {
  if (cancelled) return "CANCELLED";
  switch (status) {
    case "FULFILLED":
      return "FULFILLED";
    case "PARTIALLY_FULFILLED":
    case "IN_PROGRESS":
    case "OPEN":
      return "IN_TRANSIT";
    case "RESTOCKED":
      return "RETURNED";
    default:
      return "UNFULFILLED";
  }
}

function mapFinancial(status: string | null): string | null {
  switch (status) {
    case "PAID":
      return "PAID";
    case "PARTIALLY_REFUNDED":
      return "PARTIALLY_REFUNDED";
    case "REFUNDED":
      return "REFUNDED";
    case "PENDING":
    case "AUTHORIZED":
      return "PENDING";
    default:
      return null;
  }
}

async function syncProducts(
  storeId: string,
  shop: string,
  token: string,
  result: SyncResult,
): Promise<void> {
  let cursor: string | null = null;
  let pages = 0;

  do {
    const response: ProductsResponse = await shopifyGraphQL<ProductsResponse>(
      shop,
      token,
      PRODUCTS_QUERY,
      { cursor },
    );

    for (const product of response.products.nodes) {
      for (const variant of product.variants.nodes) {
        const name =
          variant.title && variant.title !== "Default Title"
            ? `${product.title} - ${variant.title}`
            : product.title;

        const data = {
          storeId,
          name,
          sku: variant.sku || null,
          category: product.productType || null,
          sellingPriceMinor: parseMoney(variant.price) ?? 0n,
          // Shopify only exposes unit cost when the merchant has entered it.
          unitCostMinor: parseMoney(variant.inventoryItem?.unitCost?.amount ?? "0") ?? 0n,
          quantityOnHand: variant.inventoryQuantity ?? 0,
          shopifyProductGid: variant.id,
        };

        const existing = await prisma.product.findFirst({
          where: {
            storeId,
            deletedAt: null,
            OR: [
              { shopifyProductGid: variant.id },
              ...(variant.sku ? [{ sku: variant.sku }] : []),
            ],
          },
          select: { id: true, unitCostMinor: true },
        });

        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              ...data,
              // Never overwrite a cost the owner entered with a Shopify zero.
              unitCostMinor:
                data.unitCostMinor > 0n ? data.unitCostMinor : existing.unitCostMinor,
            },
          });
          result.productsUpdated += 1;
        } else {
          await prisma.product.create({ data });
          result.productsCreated += 1;
        }
      }
    }

    cursor = response.products.pageInfo.hasNextPage ? response.products.pageInfo.endCursor : null;
    pages += 1;
  } while (cursor && pages < 100);
}
