import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/shopify/oauth";
import { normaliseShopDomain } from "@/lib/shopify/config";
import { logWebhook, topicAction } from "@/lib/shopify/webhooks";
import { upsertOrderFromShopify } from "@/lib/orders/from-shopify";
import { recomputeShipment, recordTrackingEvents } from "@/lib/orders/tracking";
import { ORDER_STATUS } from "@/lib/orders/statuses";
import { parseMoney } from "@/lib/money";
import type { ShopifyOrderNode } from "@/lib/shopify/client";

/**
 * Shopify webhook receiver.
 *
 * Every request is HMAC-verified before anything is read from it, and the shop
 * domain is matched to a connected store — an unsigned or unknown request is
 * rejected without touching the database.
 *
 * Shopify retries on any non-2xx, so a failure we cannot fix by retrying (an
 * unparseable body, an unknown shop) still returns 200 with the problem logged;
 * only genuine transient failures return 500 to invite a retry.
 */
export async function POST(request: Request) {
  const topic = request.headers.get("x-shopify-topic") ?? "";
  const hmac = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const shopHeader = request.headers.get("x-shopify-shop-domain") ?? "";

  // Raw body, exactly as sent — any reserialisation breaks the signature.
  const rawBody = await request.text();

  if (!hmac || !verifyWebhookSignature(rawBody, hmac)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const shop = normaliseShopDomain(shopHeader);
  if (!shop) return new NextResponse("Unknown shop", { status: 401 });

  const store = await prisma.store.findFirst({
    where: { shopifyDomain: shop },
    select: { id: true },
  });
  if (!store) {
    // Signed by our app but for a store we no longer hold. Nothing to retry.
    return NextResponse.json({ ok: true, ignored: "store not connected" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    await logWebhook(store.id, topic, "FAILED", "Body was not valid JSON");
    return NextResponse.json({ ok: true, ignored: "unparseable body" });
  }

  try {
    switch (topicAction(topic)) {
      case "UPSERT_ORDER": {
        const node = toOrderNode(payload);
        if (!node) {
          await logWebhook(store.id, topic, "FAILED", "Payload had no usable order");
          break;
        }
        const result = await upsertOrderFromShopify(store.id, node);
        await logWebhook(
          store.id,
          topic,
          "SUCCESS",
          `${result.created ? "Created" : "Updated"} ${node.name}`,
        );
        break;
      }

      case "FULFILLMENT": {
        await handleFulfillment(store.id, payload, topic);
        break;
      }

      default:
        await logWebhook(store.id, topic, "SUCCESS", "Ignored — topic not handled");
    }
  } catch (error) {
    await logWebhook(
      store.id,
      topic,
      "FAILED",
      (error as Error).message,
      (error as Error).stack ?? undefined,
    );
    // Transient — let Shopify retry.
    return new NextResponse("Processing failed", { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Webhook payloads are the REST shape, not GraphQL. Translate to the node
 * shape the importer already understands so there is one mapping, not two.
 */
function toOrderNode(payload: Record<string, unknown>): ShopifyOrderNode | null {
  const name = str(payload.name) ?? (payload.order_number ? `#${payload.order_number}` : null);
  const createdAt = str(payload.created_at);
  if (!name || !createdAt) return null;

  const address = (payload.shipping_address ?? payload.billing_address) as
    | Record<string, unknown>
    | undefined;
  const customer = payload.customer as Record<string, unknown> | undefined;
  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
  const fulfillments = Array.isArray(payload.fulfillments) ? payload.fulfillments : [];

  const moneyString = (value: unknown) => (value === undefined || value === null ? "0" : String(value));

  return {
    id: payload.admin_graphql_api_id
      ? String(payload.admin_graphql_api_id)
      : `gid://shopify/Order/${payload.id}`,
    legacyResourceId: payload.id ? String(payload.id) : null,
    name,
    createdAt,
    cancelledAt: str(payload.cancelled_at),
    closedAt: str(payload.closed_at),
    displayFinancialStatus: str(payload.financial_status)?.toUpperCase() ?? null,
    displayFulfillmentStatus: str(payload.fulfillment_status)?.toUpperCase() ?? "UNFULFILLED",
    note: str(payload.note),
    tags: typeof payload.tags === "string" && payload.tags ? payload.tags.split(",").map((t) => t.trim()) : [],
    email: str(payload.email),
    phone: str(payload.phone),
    paymentGatewayNames: Array.isArray(payload.payment_gateway_names)
      ? payload.payment_gateway_names.map(String)
      : [],
    customer: customer
      ? {
          displayName:
            [str(customer.first_name), str(customer.last_name)].filter(Boolean).join(" ") || "",
          email: str(customer.email),
          phone: str(customer.phone),
        }
      : null,
    shippingAddress: address
      ? {
          name: str(address.name),
          phone: str(address.phone),
          address1: str(address.address1),
          address2: str(address.address2),
          city: str(address.city),
          province: str(address.province),
          zip: str(address.zip),
          country: str(address.country),
        }
      : null,
    currentSubtotalPriceSet: {
      shopMoney: {
        amount: moneyString(payload.current_subtotal_price ?? payload.subtotal_price),
        currencyCode: str(payload.currency) ?? "PKR",
      },
    },
    currentTotalDiscountsSet: {
      shopMoney: { amount: moneyString(payload.current_total_discounts ?? payload.total_discounts) },
    },
    totalRefundedSet: { shopMoney: { amount: "0" } },
    totalShippingPriceSet: {
      shopMoney: { amount: shippingTotal(payload) },
    },
    currentTotalPriceSet: {
      shopMoney: { amount: moneyString(payload.current_total_price ?? payload.total_price) },
    },
    fulfillments: fulfillments.map((entry) => {
      const fulfillment = entry as Record<string, unknown>;
      const numbers = Array.isArray(fulfillment.tracking_numbers)
        ? fulfillment.tracking_numbers.map(String)
        : fulfillment.tracking_number
          ? [String(fulfillment.tracking_number)]
          : [];
      return {
        trackingInfo: numbers.map((number) => ({
          number,
          company: str(fulfillment.tracking_company),
          url: str(fulfillment.tracking_url),
        })),
      };
    }),
    lineItems: {
      nodes: lineItems.map((entry) => {
        const item = entry as Record<string, unknown>;
        const quantity = Number(item.quantity ?? 1) || 1;
        const unit = moneyString(item.price);
        return {
          id: item.admin_graphql_api_id ? String(item.admin_graphql_api_id) : undefined,
          title: str(item.title) ?? "Item",
          variantTitle: str(item.variant_title),
          quantity,
          sku: str(item.sku),
          originalUnitPriceSet: { shopMoney: { amount: unit } },
          originalTotalSet: {
            shopMoney: { amount: String((parseMoney(unit) ?? 0n) * BigInt(quantity) / 100n) },
          },
        };
      }),
    },
  };
}

function shippingTotal(payload: Record<string, unknown>): string {
  const lines = payload.shipping_lines;
  if (!Array.isArray(lines)) return "0";
  const total = lines.reduce((sum, entry) => {
    const line = entry as Record<string, unknown>;
    return sum + (parseMoney(String(line.price ?? "0")) ?? 0n);
  }, 0n);
  return (Number(total) / 100).toFixed(2);
}

/**
 * A fulfillment webhook carries the tracking number, which is what turns an
 * order into a trackable shipment.
 */
async function handleFulfillment(
  storeId: string,
  payload: Record<string, unknown>,
  topic: string,
): Promise<void> {
  const orderNumber = str(payload.name) ?? null;
  const orderId = payload.order_id ? String(payload.order_id) : null;

  const order = await prisma.order.findFirst({
    where: {
      storeId,
      deletedAt: null,
      ...(orderId
        ? { shopifyOrderId: orderId }
        : orderNumber
          ? { orderNumber: orderNumber.split(".")[0] }
          : { id: "__none__" }),
    },
    select: { id: true },
  });

  if (!order) {
    await logWebhook(storeId, topic, "FAILED", "No matching order for this fulfillment");
    return;
  }

  const numbers = Array.isArray(payload.tracking_numbers)
    ? payload.tracking_numbers.map(String)
    : payload.tracking_number
      ? [String(payload.tracking_number)]
      : [];

  if (numbers.length === 0) {
    await logWebhook(storeId, topic, "SUCCESS", "Fulfillment carried no tracking number");
    return;
  }

  const courier = await prisma.courier.findUnique({
    where: { storeId_code: { storeId, code: "LEOPARDS" } },
    select: { id: true },
  });

  for (const trackingNumber of [...new Set(numbers)].filter(Boolean)) {
    const existing = await prisma.shipment.findUnique({
      where: { storeId_trackingNumber: { storeId, trackingNumber } },
      select: { id: true },
    });
    if (existing) continue;

    const shipment = await prisma.shipment.create({
      data: {
        storeId,
        orderId: order.id,
        courierId: courier?.id ?? null,
        trackingNumber,
        status: ORDER_STATUS.SHIPMENT_CREATED,
        bookedAt: new Date(str(payload.created_at) ?? Date.now()),
        courierOrderId: orderNumber,
      },
    });

    await recordTrackingEvents(shipment.id, [
      {
        occurredAt: new Date(str(payload.created_at) ?? Date.now()),
        source: "SHOPIFY",
        internalStatus: ORDER_STATUS.SHIPMENT_CREATED,
        description: `Fulfillment created in Shopify — CN ${trackingNumber}`,
      },
    ]);
    await recomputeShipment(shipment.id);
  }

  await logWebhook(storeId, topic, "SUCCESS", `Recorded ${numbers.length} tracking number(s)`);
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}
