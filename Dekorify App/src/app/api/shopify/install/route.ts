import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentStore, getCurrentUser } from "@/lib/auth";
import {
  OAUTH_SHOP_COOKIE,
  OAUTH_STATE_COOKIE,
  normaliseShopDomain,
  publicAppUrl,
  readShopifyConfig,
} from "@/lib/shopify/config";
import { buildAuthorizeUrl, generateNonce } from "@/lib/shopify/oauth";

export async function GET(request: Request) {
  // Redirects use the public app URL, not request.url: behind Railway's proxy
  // the latter is the internal bind host (0.0.0.0:$PORT) and is unreachable.
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, publicAppUrl()));

  const user = await getCurrentUser();
  if (!user) {
    return redirectTo("/login");
  }

  const store = await getCurrentStore(user.id);
  if (!store) {
    return redirectTo("/settings/new-store");
  }

  const config = readShopifyConfig();
  if (!config) {
    return redirectTo("/settings/shopify?error=not_configured");
  }

  const requested = new URL(request.url).searchParams.get("shop") ?? "";
  const shop = normaliseShopDomain(requested);

  if (!shop) {
    return redirectTo("/settings/shopify?error=invalid_shop");
  }

  // The nonce ties the callback to this browser session, so a stray callback
  // cannot attach someone else's store to this account.
  const state = generateNonce();
  const cookieStore = await cookies();

  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };

  cookieStore.set(OAUTH_STATE_COOKIE, state, options);
  cookieStore.set(OAUTH_SHOP_COOKIE, shop, options);

  return NextResponse.redirect(buildAuthorizeUrl(shop, state, config));
}
