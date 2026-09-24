/**
 * Typed Shopify failures.
 *
 * Every error carries the HTTP status our own API should answer with, so a
 * route handler never has to interpret a message string to decide between
 * "your token is wrong" (401) and "that product does not exist" (404).
 */

export type ShopifyErrorKind =
  | "UNAUTHENTICATED"
  | "FORBIDDEN_SCOPE"
  | "NOT_CONNECTED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "NETWORK"
  | "UPSTREAM";

const STATUS_BY_KIND: Record<ShopifyErrorKind, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN_SCOPE: 403,
  NOT_CONNECTED: 409,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INVALID_REQUEST: 400,
  NETWORK: 502,
  UPSTREAM: 502,
};

export class ShopifyApiError extends Error {
  readonly kind: ShopifyErrorKind;
  /** The status our own endpoint should return. */
  readonly httpStatus: number;
  /** The status Shopify returned, when there was one. */
  readonly upstreamStatus?: number;
  /** Scopes Shopify said were missing, when it told us. */
  readonly missingScopes?: string[];

  constructor(
    message: string,
    options: {
      kind?: ShopifyErrorKind;
      upstreamStatus?: number;
      missingScopes?: string[];
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "ShopifyApiError";
    this.kind = options.kind ?? "UPSTREAM";
    this.httpStatus = STATUS_BY_KIND[this.kind];
    this.upstreamStatus = options.upstreamStatus;
    this.missingScopes = options.missingScopes;
    if (options.cause) this.cause = options.cause;
  }
}

export function notConnected(): ShopifyApiError {
  return new ShopifyApiError(
    "This store is not connected to Shopify. Connect it in Settings → Shopify.",
    { kind: "NOT_CONNECTED" },
  );
}

export function notFound(resource: string, id: string): ShopifyApiError {
  return new ShopifyApiError(`No ${resource} found with id "${id}".`, { kind: "NOT_FOUND" });
}

export function invalidRequest(message: string): ShopifyApiError {
  return new ShopifyApiError(message, { kind: "INVALID_REQUEST" });
}

/**
 * Shopify reports a missing scope as an ACCESS_DENIED extension code, or as a
 * message naming the scope. Both spellings are recognised so the caller gets a
 * 403 that says which permission to add, rather than a generic failure.
 */
export function classifyGraphQLErrors(
  errors: { message: string; extensions?: { code?: string; requiredAccess?: string } }[],
): ShopifyApiError {
  const combined = errors.map((error) => error.message).join("; ");

  const accessDenied = errors.find(
    (error) =>
      error.extensions?.code === "ACCESS_DENIED" ||
      /access denied|not approved|requires.*scope|merchant approval/i.test(error.message),
  );

  if (accessDenied) {
    const required = accessDenied.extensions?.requiredAccess;
    const named = combined.match(/read_[a-z_]+/g);
    const missingScopes = required ? [required] : named ? [...new Set(named)] : undefined;

    return new ShopifyApiError(
      missingScopes
        ? `Shopify denied access. The app is missing: ${missingScopes.join(", ")}.`
        : `Shopify denied access: ${combined}`,
      { kind: "FORBIDDEN_SCOPE", missingScopes },
    );
  }

  if (errors.some((error) => error.extensions?.code === "THROTTLED")) {
    return new ShopifyApiError("Shopify is throttling this store. Try again shortly.", {
      kind: "RATE_LIMITED",
    });
  }

  return new ShopifyApiError(`Shopify rejected the query: ${combined}`, { kind: "UPSTREAM" });
}

/**
 * Server-side log line for a Shopify failure.
 *
 * Deliberately narrow: the message, the kind and the upstream status. Access
 * tokens, request bodies and customer details are never written out.
 */
export function logShopifyError(context: string, error: unknown): void {
  if (error instanceof ShopifyApiError) {
    console.error(
      `[shopify] ${context} failed — kind=${error.kind}` +
        (error.upstreamStatus ? ` upstream=${error.upstreamStatus}` : "") +
        (error.missingScopes ? ` missing=${error.missingScopes.join(",")}` : "") +
        ` :: ${error.message}`,
    );
    return;
  }

  console.error(`[shopify] ${context} failed — ${(error as Error)?.message ?? "unknown error"}`);
}
