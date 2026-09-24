import { prisma } from "../db";
import { shopifyGraphQL } from "./client";
import { ShopifyApiError, notConnected } from "./errors";

/**
 * The reusable layer every Shopify endpoint is built on.
 *
 * A route handler should only ever need `shopifyRequest` or `paginate` from
 * here — resolving the store's credentials, walking cursors and enforcing page
 * limits all live in one place so a new endpoint is a query plus a mapper.
 */

export interface ShopifyConnection {
  storeId: string;
  shop: string;
  accessToken: string;
}

/**
 * Loads the connected shop's credentials.
 *
 * The access token is read here and passed straight to the HTTP layer. It is
 * never returned to a caller that might serialise it, and never reaches a
 * client component.
 */
export async function getShopifyConnection(storeId: string): Promise<ShopifyConnection> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { shopifyDomain: true, shopifyAccessToken: true },
  });

  if (!store?.shopifyDomain || !store.shopifyAccessToken) throw notConnected();

  return {
    storeId,
    shop: store.shopifyDomain,
    accessToken: store.shopifyAccessToken,
  };
}

/** Runs one query against the connected store. */
export async function shopifyRequest<T>(
  connection: ShopifyConnection,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  return shopifyGraphQL<T>(connection.shop, connection.accessToken, query, variables);
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Shopify's hard ceiling for a connection page. */
export const MAX_PAGE_SIZE = 250;
export const DEFAULT_PAGE_SIZE = 50;

/** Safety net when walking every page, so a runaway loop cannot hang a request. */
export const MAX_PAGES_WHEN_FETCHING_ALL = 200;

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface Connection<T> {
  pageInfo: PageInfo;
  nodes: T[];
}

export interface PageParams {
  limit: number;
  cursor: string | null;
  /** Walk every page rather than returning just one. */
  all: boolean;
}

/**
 * Reads pagination options off the query string.
 *
 * `limit` is clamped rather than rejected: a caller asking for 1,000 wants as
 * much as possible, and failing the request would be unhelpful.
 */
export function readPageParams(url: URL): PageParams {
  const raw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(raw)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, raw))
    : DEFAULT_PAGE_SIZE;

  const all = ["1", "true", "yes"].includes(
    (url.searchParams.get("all") ?? "").trim().toLowerCase(),
  );

  return { limit, cursor: url.searchParams.get("cursor") || null, all };
}

export interface PagedResult<T> {
  items: T[];
  pageInfo: PageInfo;
  /** True when `all` was requested but the page cap stopped the walk early. */
  truncated: boolean;
}

/**
 * Fetches one page, or walks every page when `all` is set.
 *
 * `select` pulls the connection out of whatever shape the query returned, so
 * each caller keeps its own typed query without re-implementing the loop.
 */
export async function paginate<TResponse, TNode>(
  connection: ShopifyConnection,
  query: string,
  variables: Record<string, unknown>,
  select: (response: TResponse) => Connection<TNode>,
  params: PageParams,
): Promise<PagedResult<TNode>> {
  const items: TNode[] = [];
  let cursor = params.cursor;
  let pageInfo: PageInfo = { hasNextPage: false, endCursor: null };
  let pages = 0;

  do {
    const response = await shopifyRequest<TResponse>(connection, query, {
      ...variables,
      first: params.limit,
      cursor,
    });

    const page = select(response);
    items.push(...page.nodes);
    pageInfo = page.pageInfo;
    cursor = page.pageInfo.endCursor;
    pages += 1;

    if (!params.all) break;
  } while (pageInfo.hasNextPage && pages < MAX_PAGES_WHEN_FETCHING_ALL);

  return {
    items,
    pageInfo,
    truncated: params.all && pageInfo.hasNextPage,
  };
}

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/**
 * Accepts either a numeric id or a full GID and returns a GID.
 *
 * Callers of our API should not have to know Shopify's `gid://` format, but
 * anything already holding one should not have it mangled.
 */
export function toGid(type: string, id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("gid://")) return trimmed;
  if (/^\d+$/.test(trimmed)) return `gid://shopify/${type}/${trimmed}`;
  return trimmed;
}

/** The numeric tail of a GID, which is what merchants see in the admin URL. */
export function fromGid(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const match = gid.match(/\/(\d+)(?:\?.*)?$/);
  return match ? match[1] : gid;
}

// ---------------------------------------------------------------------------
// Scope verification
// ---------------------------------------------------------------------------

const ACCESS_SCOPES_QUERY = `
  query AccessScopes {
    currentAppInstallation {
      accessScopes { handle }
    }
  }
`;

interface AccessScopesResponse {
  currentAppInstallation: { accessScopes: { handle: string }[] } | null;
}

/** Scopes each endpoint needs, used by the verification helper below. */
export const REQUIRED_SCOPES = {
  shop: [] as string[],
  products: ["read_products"],
  collections: ["read_products"],
  orders: ["read_orders"],
  ordersBeyond60Days: ["read_orders", "read_all_orders"],
  customers: ["read_customers"],
  inventory: ["read_inventory", "read_locations"],
} as const;

export interface ScopeReport {
  granted: string[];
  missing: string[];
  satisfied: boolean;
}

/**
 * Asks Shopify which scopes the installed app actually holds.
 *
 * The configured `SHOPIFY_SCOPES` is only a request; this is the grant, which
 * is what determines whether a query will succeed.
 */
export async function verifyScopes(
  connection: ShopifyConnection,
  required: readonly string[],
): Promise<ScopeReport> {
  const response = await shopifyRequest<AccessScopesResponse>(connection, ACCESS_SCOPES_QUERY);

  const granted = (response.currentAppInstallation?.accessScopes ?? []).map(
    (scope) => scope.handle,
  );
  const missing = required.filter((scope) => !granted.includes(scope));

  return { granted, missing, satisfied: missing.length === 0 };
}

/** Throws a 403 naming the missing scopes, for use before an expensive walk. */
export async function assertScopes(
  connection: ShopifyConnection,
  required: readonly string[],
): Promise<void> {
  if (required.length === 0) return;

  const report = await verifyScopes(connection, required);
  if (report.satisfied) return;

  throw new ShopifyApiError(
    `The Shopify app is missing required access: ${report.missing.join(", ")}. ` +
      "Add these scopes to the app and reinstall it.",
    { kind: "FORBIDDEN_SCOPE", missingScopes: report.missing },
  );
}
