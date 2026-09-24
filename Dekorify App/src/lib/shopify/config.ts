/**
 * Shopify credentials come from the environment only — never from the database
 * and never hard-coded. Until they are set, the integration reports itself as
 * unconfigured and the UI explains what to do rather than failing at runtime.
 */

export interface ShopifyConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  appUrl: string;
  apiVersion: string;
}

/** Latest version supported at the time of writing. */
export const DEFAULT_SHOPIFY_API_VERSION = "2026-07";

/**
 * Every scope the integration needs, and why:
 *
 *   read_orders       orders, line items, fulfilments
 *   read_all_orders   lifts Shopify's default 60-day order window
 *   read_products     products, variants, collections
 *   read_customers    customer records
 *   read_inventory    stock levels per location
 *   read_locations    names the location a stock level belongs to
 *
 * The connect screen shows this same list, so a scope added here cannot drift
 * out of step with what the user is told to grant.
 */
export const REQUIRED_ADMIN_SCOPES = [
  "read_orders",
  "read_all_orders",
  "read_products",
  "read_customers",
  "read_inventory",
  "read_locations",
] as const;

/**
 * The API version alone, with no OAuth credentials required.
 *
 * A store connected with a custom-app access token never needs an app key or
 * secret — only the version, to build the endpoint URL. Reading it separately
 * is what lets that connection work on a machine with no OAuth app configured.
 */
export function shopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION?.trim() || DEFAULT_SHOPIFY_API_VERSION;
}

export function readShopifyConfig(): ShopifyConfig | null {
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();

  if (!apiKey || !apiSecret) return null;

  return {
    apiKey,
    apiSecret,
    scopes: process.env.SHOPIFY_SCOPES?.trim() || REQUIRED_ADMIN_SCOPES.join(","),
    appUrl: (process.env.SHOPIFY_APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, ""),
    apiVersion: shopifyApiVersion(),
  };
}

export function isShopifyConfigured(): boolean {
  return readShopifyConfig() !== null;
}

/**
 * Only ever talk to a genuine Shopify domain. Without this check a crafted
 * `shop` parameter could point the OAuth exchange at an attacker's server and
 * leak the app's client secret.
 */
export function normaliseShopDomain(input: string): string | null {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  const withSuffix = value.includes(".") ? value : `${value}.myshopify.com`;

  return /^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$/.test(withSuffix) ? withSuffix : null;
}

export const OAUTH_STATE_COOKIE = "shopify_oauth_state";
export const OAUTH_SHOP_COOKIE = "shopify_oauth_shop";
