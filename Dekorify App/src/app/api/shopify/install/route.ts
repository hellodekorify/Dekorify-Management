import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentStore, getCurrentUser } from "@/lib/auth";
import {
  OAUTH_SHOP_COOKIE,
  OAUTH_STATE_COOKIE,
  normaliseShopDomain,
  readShopifyConfig,
} from "@/lib/shopify/config";
import { buildAuthorizeUrl, generateNonce } from "@/lib/shopify/oauth";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const store = await getCurrentStore(user.id);
  if (!store) {
    return NextResponse.redirect(new URL("/settings/new-store", request.url));
  }

  const config = readShopifyConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/settings/shopify?error=not_configured", request.url));
  }

  const requested = new URL(request.url).searchParams.get("shop") ?? "";
  const shop = normaliseShopDomain(requested);

  if (!shop) {
    return NextResponse.redirect(new URL("/settings/shopify?error=invalid_shop", request.url));
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
