import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readShopifyConfig, type ShopifyConfig } from "./config";

export function generateNonce(): string {
  return randomBytes(24).toString("hex");
}

export function buildAuthorizeUrl(shop: string, state: string, config: ShopifyConfig): string {
  const params = new URLSearchParams({
    client_id: config.apiKey,
    scope: config.scopes,
    redirect_uri: `${config.appUrl}/api/shopify/callback`,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Shopify signs every callback. Verifying the HMAC is what proves the request
 * really came from Shopify and was not forged, so it must happen before the
 * code is exchanged for a token.
 */
export function verifyCallbackHmac(searchParams: URLSearchParams, secret: string): boolean {
  const supplied = searchParams.get("hmac");
  if (!supplied) return false;

  const message = [...searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${encodeKey(key)}=${encodeKey(value)}`)
    .join("&");

  const expected = createHmac("sha256", secret).update(message).digest("hex");

  const suppliedBuffer = Buffer.from(supplied, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (suppliedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}

/** Shopify's signature spec escapes % & = inside keys and values. */
function encodeKey(value: string): string {
  return value.replace(/%/g, "%25").replace(/&/g, "%26").replace(/=/g, "%3D");
}

export interface AccessTokenResponse {
  access_token: string;
  scope: string;
}

export async function exchangeCodeForToken(
  shop: string,
  code: string,
): Promise<AccessTokenResponse> {
  const config = readShopifyConfig();
  if (!config) throw new Error("Shopify credentials are not configured.");

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: config.apiKey,
      client_secret: config.apiSecret,
      code,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Shopify rejected the token exchange (${response.status}): ${detail}`);
  }

  const payload = (await response.json()) as Partial<AccessTokenResponse>;
  if (!payload.access_token) {
    throw new Error("Shopify did not return an access token.");
  }

  return { access_token: payload.access_token, scope: payload.scope ?? "" };
}

/**
 * Verifies an incoming webhook body. Not wired to any route yet, but webhooks
 * are the natural next step after the initial sync and the check belongs with
 * the rest of the OAuth code.
 */
export function verifyWebhookSignature(rawBody: string, headerHmac: string): boolean {
  const config = readShopifyConfig();
  if (!config) return false;

  const expected = createHmac("sha256", config.apiSecret).update(rawBody, "utf8").digest("base64");

  const suppliedBuffer = Buffer.from(headerHmac, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (suppliedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}
