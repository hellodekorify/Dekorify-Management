import { prisma } from "../db";
import { readShopifyConfig } from "./config";
import { shopifyGraphQL } from "./client";

/**
 * Shopify webhook registration.
 *
 * Webhooks keep the order book close to live without polling. They are
 * registered against the app URL, so a local install needs a public tunnel
 * (ngrok, Cloudflare Tunnel) before Shopify can reach it — registration is
 * therefore attempted on connect but never allowed to fail the connection.
 */

export const WEBHOOK_TOPICS = [
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "ORDERS_FULFILLED",
  "FULFILLMENTS_CREATE",
  "FULFILLMENTS_UPDATE",
] as const;

export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number];

const CREATE_WEBHOOK = `
  mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
    ) {
      webhookSubscription { id topic }
      userErrors { field message }
    }
  }
`;

const LIST_WEBHOOKS = `
  query Webhooks {
    webhookSubscriptions(first: 50) {
      nodes {
        id
        topic
        endpoint { ... on WebhookHttpEndpoint { callbackUrl } }
      }
    }
  }
`;

interface ListResponse {
  webhookSubscriptions: {
    nodes: {
      id: string;
      topic: string;
      endpoint: { callbackUrl?: string } | null;
    }[];
  };
}

interface CreateResponse {
  webhookSubscriptionCreate: {
    webhookSubscription: { id: string; topic: string } | null;
    userErrors: { field: string[]; message: string }[];
  };
}

export interface RegistrationResult {
  registered: string[];
  alreadyPresent: string[];
  failed: { topic: string; reason: string }[];
  callbackUrl: string;
}

export async function registerWebhooks(
  shop: string,
  accessToken: string,
): Promise<RegistrationResult> {
  const config = readShopifyConfig();
  if (!config) throw new Error("Shopify credentials are not configured.");

  const callbackUrl = `${config.appUrl}/api/shopify/webhooks`;

  const result: RegistrationResult = {
    registered: [],
    alreadyPresent: [],
    failed: [],
    callbackUrl,
  };

  let existing: ListResponse["webhookSubscriptions"]["nodes"] = [];
  try {
    const listed = await shopifyGraphQL<ListResponse>(shop, accessToken, LIST_WEBHOOKS);
    existing = listed.webhookSubscriptions.nodes;
  } catch {
    // Listing is a nicety; carry on and let create report duplicates.
  }

  const alreadyThere = new Set(
    existing
      .filter((node) => node.endpoint?.callbackUrl === callbackUrl)
      .map((node) => node.topic),
  );

  for (const topic of WEBHOOK_TOPICS) {
    if (alreadyThere.has(topic)) {
      result.alreadyPresent.push(topic);
      continue;
    }

    try {
      const response = await shopifyGraphQL<CreateResponse>(shop, accessToken, CREATE_WEBHOOK, {
        topic,
        callbackUrl,
      });

      const errors = response.webhookSubscriptionCreate.userErrors;
      if (errors.length > 0) {
        const message = errors.map((error) => error.message).join("; ");
        // Shopify reports an existing subscription as a user error.
        if (/already|taken/i.test(message)) result.alreadyPresent.push(topic);
        else result.failed.push({ topic, reason: message });
      } else {
        result.registered.push(topic);
      }
    } catch (error) {
      result.failed.push({ topic, reason: (error as Error).message });
    }
  }

  return result;
}

/** Topics Shopify may send us, mapped to what we do with them. */
export function topicAction(topic: string): "UPSERT_ORDER" | "FULFILLMENT" | "IGNORE" {
  const normalised = topic.toLowerCase();
  if (normalised.startsWith("orders/")) return "UPSERT_ORDER";
  if (normalised.startsWith("fulfillments/")) return "FULFILLMENT";
  return "IGNORE";
}

export async function logWebhook(
  storeId: string,
  topic: string,
  status: "SUCCESS" | "FAILED",
  message: string,
  detail?: string,
): Promise<void> {
  await prisma.syncLog.create({
    data: {
      storeId,
      kind: "SHOPIFY_WEBHOOK",
      trigger: "WEBHOOK",
      status,
      finishedAt: new Date(),
      durationMs: 0,
      itemsChecked: 1,
      itemsUpdated: status === "SUCCESS" ? 1 : 0,
      itemsFailed: status === "FAILED" ? 1 : 0,
      message: `${topic}: ${message}`,
      detail: detail?.slice(0, 4000),
    },
  });
}
