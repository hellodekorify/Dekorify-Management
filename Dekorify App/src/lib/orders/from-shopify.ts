import { prisma } from "../db";
import { parseMoney } from "../money";
import { ORDER_STATUS } from "./statuses";
import { recomputeShipment, recordTrackingEvents } from "./tracking";
import type { ShopifyOrderNode } from "../shopify/client";

/**
 * Turns a Shopify order into the operational Order record.
 *
 * Upserts on the store's order number, so re-syncing an order corrects it
 * rather than duplicating it. Fields the operator controls — internal status,
 * issue flags, notes — are never overwritten by a re-sync; only what Shopify
 * owns is refreshed.
 */

export interface UpsertResult {
  created: boolean;
  orderId: string;
}

export async function upsertOrderFromShopify(
  storeId: string,
  node: ShopifyOrderNode,
  saleId?: string | null,
): Promise<UpsertResult> {
  const money = (value: string | null | undefined) => parseMoney(value ?? "0") ?? 0n;

  const address = node.shippingAddress ?? null;
  const cancelled = node.cancelledAt !== null && node.cancelledAt !== undefined;

  const shopifyOwned = {
    shopifyOrderId: node.legacyResourceId ?? null,
    shopifyOrderGid: node.id,
    placedAt: new Date(node.createdAt),
    cancelledAt: cancelled ? new Date(node.cancelledAt!) : null,

    customerName: address?.name ?? node.customer?.displayName ?? null,
    customerPhone: normalisePhone(address?.phone ?? node.phone ?? node.customer?.phone ?? null),
    customerEmail: node.email ?? node.customer?.email ?? null,

    address1: address?.address1 ?? null,
    address2: address?.address2 ?? null,
    city: address?.city ?? null,
    province: address?.province ?? null,
    postalCode: address?.zip ?? null,
    country: address?.country ?? null,

    subtotalMinor: money(node.currentSubtotalPriceSet?.shopMoney.amount),
    discountMinor: money(node.currentTotalDiscountsSet?.shopMoney.amount),
    shippingMinor: money(node.totalShippingPriceSet?.shopMoney.amount),
    totalMinor: money(
      node.currentTotalPriceSet?.shopMoney.amount ??
        node.currentSubtotalPriceSet?.shopMoney.amount,
    ),
    currency: node.currentSubtotalPriceSet?.shopMoney.currencyCode ?? "PKR",

    paymentMethod: derivePaymentMethod(node),
    paymentStatus: node.displayFinancialStatus ?? null,
    shopifyFulfillmentStatus: node.displayFulfillmentStatus ?? null,
    shopifyFinancialStatus: node.displayFinancialStatus ?? null,
    tags: node.tags?.length ? node.tags.join(", ") : null,
    notes: node.note ?? null,
  };

  const existing = await prisma.order.findUnique({
    where: { storeId_orderNumber: { storeId, orderNumber: node.name } },
    select: { id: true, status: true },
  });

  if (existing) {
    await prisma.order.update({
      where: { id: existing.id },
      data: {
        ...shopifyOwned,
        ...(saleId ? { saleId } : {}),
        // A cancellation in Shopify is authoritative and closes the order here.
        ...(cancelled && existing.status !== ORDER_STATUS.CANCELLED
          ? { status: ORDER_STATUS.CANCELLED, closedAt: new Date(node.cancelledAt!) }
          : {}),
      },
    });

    await replaceItems(existing.id, node);
    await attachShopifyTracking(storeId, existing.id, node);

    return { created: false, orderId: existing.id };
  }

  const order = await prisma.order.create({
    data: {
      storeId,
      orderNumber: node.name,
      saleId: saleId ?? null,
      status: cancelled ? ORDER_STATUS.CANCELLED : ORDER_STATUS.NEW,
      closedAt: cancelled ? new Date(node.cancelledAt!) : null,
      ...shopifyOwned,
    },
  });

  await replaceItems(order.id, node);
  await attachShopifyTracking(storeId, order.id, node);

  return { created: true, orderId: order.id };
}

/** Line items mirror Shopify exactly, so they are replaced wholesale. */
async function replaceItems(orderId: string, node: ShopifyOrderNode): Promise<void> {
  const money = (value: string | null | undefined) => parseMoney(value ?? "0") ?? 0n;

  const skus = node.lineItems.nodes
    .map((item) => item.sku)
    .filter((sku): sku is string => Boolean(sku));

  // Link to the catalogue where the SKU is recognised, for product reporting.
  const products =
    skus.length > 0
      ? await prisma.product.findMany({
          where: { sku: { in: skus }, deletedAt: null },
          select: { id: true, sku: true },
        })
      : [];
  const productBySku = new Map(products.map((product) => [product.sku, product.id]));

  await prisma.$transaction([
    prisma.orderItem.deleteMany({ where: { orderId } }),
    prisma.orderItem.createMany({
      data: node.lineItems.nodes.map((item) => ({
        orderId,
        productId: item.sku ? (productBySku.get(item.sku) ?? null) : null,
        title: item.title,
        variant: item.variantTitle ?? null,
        sku: item.sku,
        quantity: item.quantity,
        unitPriceMinor: money(item.originalUnitPriceSet?.shopMoney.amount),
        totalMinor: money(item.originalTotalSet?.shopMoney.amount),
        shopifyLineItemId: item.id ?? null,
      })),
    }),
  ]);
}

/**
 * If Shopify already carries a tracking number — because the shipment was
 * booked in Shopify or by another tool — adopt it so the order is tracked here
 * too rather than appearing unshipped.
 */
async function attachShopifyTracking(
  storeId: string,
  orderId: string,
  node: ShopifyOrderNode,
): Promise<void> {
  const trackingNumbers = (node.fulfillments ?? [])
    .flatMap((fulfillment) => fulfillment.trackingInfo ?? [])
    .map((info) => info.number?.trim())
    .filter((number): number is string => Boolean(number));

  if (trackingNumbers.length === 0) return;

  const courier = await prisma.courier.findUnique({
    where: { storeId_code: { storeId, code: "LEOPARDS" } },
    select: { id: true },
  });

  for (const trackingNumber of [...new Set(trackingNumbers)]) {
    const existing = await prisma.shipment.findUnique({
      where: { storeId_trackingNumber: { storeId, trackingNumber } },
      select: { id: true },
    });
    if (existing) continue;

    const shipment = await prisma.shipment.create({
      data: {
        storeId,
        orderId,
        courierId: courier?.id ?? null,
        trackingNumber,
        status: ORDER_STATUS.SHIPMENT_CREATED,
        bookedAt: new Date(node.createdAt),
        courierOrderId: node.name,
      },
    });

    await recordTrackingEvents(shipment.id, [
      {
        occurredAt: new Date(node.createdAt),
        source: "SHOPIFY",
        internalStatus: ORDER_STATUS.SHIPMENT_CREATED,
        description: `Tracking number ${trackingNumber} came from Shopify`,
      },
    ]);
    await recomputeShipment(shipment.id);
  }
}

/**
 * Shopify does not have a "COD" flag; the gateway name is how it shows up.
 * Anything cash-like, or an unpaid order with no gateway, is treated as COD —
 * which is the norm for this market.
 */
function derivePaymentMethod(node: ShopifyOrderNode): string {
  const gateways = (node.paymentGatewayNames ?? []).map((name) => name.toLowerCase());

  if (gateways.some((name) => name.includes("cash") || name.includes("cod"))) return "COD";
  if (gateways.length === 0 && node.displayFinancialStatus !== "PAID") return "COD";
  if (node.displayFinancialStatus === "PAID") return "PREPAID";
  return "COD";
}

/** Pakistani numbers arrive in several shapes; store digits with a leading 0. */
export function normalisePhone(value: string | null): string | null {
  if (!value) return null;

  const digits = value.replace(/[^\d+]/g, "");
  if (digits === "") return null;

  if (digits.startsWith("+92")) return `0${digits.slice(3)}`;
  if (digits.startsWith("92") && digits.length >= 12) return `0${digits.slice(2)}`;
  if (digits.startsWith("0")) return digits;
  if (digits.length === 10) return `0${digits}`;

  return digits;
}
