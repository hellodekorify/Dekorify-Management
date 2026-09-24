import { shopifyApiVersion } from "./config";
import { ShopifyApiError, classifyGraphQLErrors } from "./errors";

export { ShopifyApiError } from "./errors";

const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 30_000;

/** Shopify's leaky-bucket state, returned on every GraphQL response. */
interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

interface GraphQLEnvelope<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string; requiredAccess?: string } }[];
  extensions?: { cost?: { requestedQueryCost: number; throttleStatus: ThrottleStatus } };
}

/**
 * Admin GraphQL client.
 *
 * Handles what actually bites in practice: 429/5xx retries, GraphQL errors
 * returned inside a 200 response, and Shopify's leaky-bucket cost accounting —
 * when the bucket runs low the next call waits for it to refill rather than
 * being rejected.
 */
export async function shopifyGraphQL<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  // Deliberately does not require an OAuth app key or secret: a store
  // connected with a custom-app token has neither, and only needs the version.
  const url = `https://${shop}/admin/api/${shopifyApiVersion()}/graphql.json`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      const aborted = (error as Error).name === "AbortError";

      // A transient network blip is worth one more try; a timeout is not.
      if (!aborted && attempt < MAX_ATTEMPTS - 1) {
        await sleep(500 * (attempt + 1));
        continue;
      }

      throw new ShopifyApiError(
        aborted
          ? "Shopify did not respond within 30 seconds."
          : `Could not reach Shopify: ${(error as Error).message}`,
        { kind: "NETWORK", cause: error },
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === MAX_ATTEMPTS - 1) break;
      const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
      await sleep(Math.min(8000, retryAfter * 1000 * (attempt + 1)));
      continue;
    }

    if (response.status === 401) {
      throw new ShopifyApiError(
        "Shopify rejected the access token. Check it was copied in full and that the app is " +
          "still installed on this store.",
        { kind: "UNAUTHENTICATED", upstreamStatus: 401 },
      );
    }

    if (response.status === 403) {
      throw new ShopifyApiError(
        "Shopify refused the request. The app is installed but lacks the required scopes.",
        { kind: "FORBIDDEN_SCOPE", upstreamStatus: 403 },
      );
    }

    if (!response.ok) {
      throw new ShopifyApiError(`Shopify returned HTTP ${response.status}.`, {
        kind: "UPSTREAM",
        upstreamStatus: response.status,
      });
    }

    let payload: GraphQLEnvelope<T>;
    try {
      payload = (await response.json()) as GraphQLEnvelope<T>;
    } catch (error) {
      throw new ShopifyApiError("Shopify returned a response that was not JSON.", {
        kind: "UPSTREAM",
        cause: error,
      });
    }

    if (payload.errors?.length) {
      const classified = classifyGraphQLErrors(payload.errors);

      // A throttle reported in the body is retryable; a scope error is not.
      if (classified.kind === "RATE_LIMITED" && attempt < MAX_ATTEMPTS - 1) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw classified;
    }

    if (!payload.data) {
      throw new ShopifyApiError("Shopify returned an empty response.", { kind: "UPSTREAM" });
    }

    await waitForBucket(payload.extensions?.cost?.throttleStatus);

    return payload.data;
  }

  throw new ShopifyApiError(
    "Shopify is rate limiting this store. Try again in a few moments.",
    { kind: "RATE_LIMITED", upstreamStatus: 429 },
  );
}

/**
 * Pause when the query-cost bucket is nearly empty.
 *
 * Paginating a large catalogue drains it fast; waiting for a refill here keeps
 * a long walk running smoothly instead of hitting a wall of 429s.
 */
async function waitForBucket(status: ThrottleStatus | undefined): Promise<void> {
  if (!status || status.restoreRate <= 0) return;

  const floor = Math.max(100, status.maximumAvailable * 0.15);
  if (status.currentlyAvailable >= floor) return;

  const deficit = floor - status.currentlyAvailable;
  await sleep(Math.min(5000, Math.ceil((deficit / status.restoreRate) * 1000)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const SHOP_INFO_QUERY = `
  query ShopInfo {
    shop {
      name
      myshopifyDomain
      currencyCode
      ianaTimezone
      email
    }
  }
`;

export const ORDERS_QUERY = `
  query Orders($cursor: String, $query: String) {
    orders(first: 50, after: $cursor, query: $query, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        legacyResourceId
        name
        createdAt
        cancelledAt
        closedAt
        displayFinancialStatus
        displayFulfillmentStatus
        note
        tags
        email
        phone
        paymentGatewayNames
        customer { displayName email phone }
        shippingAddress {
          name
          phone
          address1
          address2
          city
          province
          zip
          country
        }
        currentSubtotalPriceSet { shopMoney { amount currencyCode } }
        currentTotalDiscountsSet { shopMoney { amount } }
        totalRefundedSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        currentTotalPriceSet { shopMoney { amount } }
        fulfillments(first: 10) {
          trackingInfo { number company url }
        }
        lineItems(first: 50) {
          nodes {
            id
            title
            variantTitle
            quantity
            sku
            originalUnitPriceSet { shopMoney { amount } }
            originalTotalSet { shopMoney { amount } }
          }
        }
      }
    }
  }
`;

export const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        productType
        variants(first: 20) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
            inventoryItem { unitCost { amount } }
          }
        }
      }
    }
  }
`;

export interface ShopInfo {
  shop: {
    name: string;
    myshopifyDomain: string;
    currencyCode: string;
    ianaTimezone: string;
    email: string;
  };
}

export interface ShopifyAddress {
  name: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
}

export interface ShopifyOrderNode {
  id: string;
  legacyResourceId?: string | null;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  closedAt?: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  note: string | null;
  tags?: string[] | null;
  email?: string | null;
  phone?: string | null;
  paymentGatewayNames?: string[] | null;
  customer: { displayName: string; email?: string | null; phone?: string | null } | null;
  shippingAddress?: ShopifyAddress | null;
  currentSubtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
  currentTotalDiscountsSet: { shopMoney: { amount: string } } | null;
  totalRefundedSet: { shopMoney: { amount: string } } | null;
  totalShippingPriceSet: { shopMoney: { amount: string } } | null;
  currentTotalPriceSet?: { shopMoney: { amount: string } } | null;
  fulfillments?: {
    trackingInfo: { number: string | null; company: string | null; url: string | null }[];
  }[];
  lineItems: {
    nodes: {
      id?: string;
      title: string;
      variantTitle?: string | null;
      quantity: number;
      sku: string | null;
      originalUnitPriceSet?: { shopMoney: { amount: string } } | null;
      originalTotalSet: { shopMoney: { amount: string } } | null;
    }[];
  };
}

export interface OrdersResponse {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ShopifyOrderNode[];
  };
}

export interface ShopifyProductNode {
  id: string;
  title: string;
  productType: string | null;
  variants: {
    nodes: {
      id: string;
      title: string;
      sku: string | null;
      price: string;
      inventoryQuantity: number | null;
      inventoryItem: { unitCost: { amount: string } | null } | null;
    }[];
  };
}

export interface ProductsResponse {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ShopifyProductNode[];
  };
}
