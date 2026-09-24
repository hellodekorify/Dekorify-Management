import { NextResponse } from "next/server";
import { getCurrentStore, getCurrentUser } from "../auth";
import {
  getShopifyConnection,
  type PageInfo,
  type ShopifyConnection,
} from "../shopify/admin";
import { ShopifyApiError, logShopifyError } from "../shopify/errors";

/**
 * Shared plumbing for the Shopify read endpoints.
 *
 * Each route supplies a name, the scopes it needs and a handler. Everything
 * else — session check, store resolution, credential lookup, error mapping and
 * the response envelope — is identical and lives here, so adding an endpoint
 * does not mean re-deciding any of it.
 */

export interface ApiMeta {
  count?: number;
  pageInfo?: PageInfo;
  /** Set when `?all=1` stopped at the page cap rather than the end. */
  truncated?: boolean;
  [key: string]: unknown;
}

function success<T>(data: T, meta?: ApiMeta): NextResponse {
  return NextResponse.json({ ok: true, data, ...(meta ? { meta } : {}) });
}

function failure(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message, ...extra } }, { status });
}

export interface RouteContext {
  connection: ShopifyConnection;
  url: URL;
  storeId: string;
}

/**
 * Wraps a Shopify endpoint.
 *
 * The access token is resolved inside and handed only to the handler; it is
 * never placed in a response body, a header or a log line.
 */
export function shopifyRoute<T>(
  name: string,
  handler: (context: RouteContext) => Promise<{ data: T; meta?: ApiMeta }>,
) {
  return async function route(request: Request): Promise<NextResponse> {
    // 1. Session — same guard every other authenticated route in this app uses.
    const user = await getCurrentUser();
    if (!user) {
      return failure(401, "UNAUTHENTICATED", "Sign in to use this endpoint.");
    }

    const store = await getCurrentStore(user.id);
    if (!store) {
      return failure(403, "NO_STORE", "No store is selected for this account.");
    }

    try {
      // 2. Shopify credentials for that store, server-side only.
      const connection = await getShopifyConnection(store.id);

      const { data, meta } = await handler({
        connection,
        url: new URL(request.url),
        storeId: store.id,
      });

      return success(data, meta);
    } catch (error) {
      if (error instanceof ShopifyApiError) {
        logShopifyError(name, error);
        return failure(error.httpStatus, error.kind, error.message, {
          ...(error.missingScopes ? { missingScopes: error.missingScopes } : {}),
        });
      }

      logShopifyError(name, error);
      return failure(500, "INTERNAL", "Something went wrong reading from Shopify.");
    }
  };
}

/** Reads a dynamic `[id]` segment, rejecting a blank one before Shopify sees it. */
export async function readIdParam(
  params: Promise<{ id: string }>,
): Promise<string> {
  const { id } = await params;
  const trimmed = (id ?? "").trim();

  if (!trimmed) {
    throw new ShopifyApiError("A resource id is required.", { kind: "INVALID_REQUEST" });
  }
  return trimmed;
}
