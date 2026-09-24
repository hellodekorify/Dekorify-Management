"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { syncShopifyProducts, syncShopifyStore } from "@/lib/shopify/sync";
import { normaliseShopDomain } from "@/lib/shopify/config";
import { SHOP_INFO_QUERY, shopifyGraphQL, type ShopInfo } from "@/lib/shopify/client";
import { ensureLeopardsCourier } from "@/lib/leopards/courier";
import { firstErrors } from "@/lib/utils";
import type { FormState } from "./auth";

/**
 * Connects a store using an Admin API access token pasted from a Shopify
 * custom app, instead of the OAuth round trip.
 *
 * OAuth needs Shopify to redirect back to a public HTTPS address, which a
 * machine running on localhost does not have. A custom app created in the
 * merchant's own admin issues a token directly, which is the practical route
 * for a single store. The token is validated against the API before it is
 * stored, so a typo fails here rather than silently at the first sync.
 */
export async function connectShopifyWithTokenAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, store } = await requireContext();

  const parsed = z
    .object({
      shop: z.string().trim().min(3, "Enter your store domain."),
      accessToken: z.string().trim().min(10, "Paste the Admin API access token."),
    })
    .safeParse({
      shop: formData.get("shop"),
      accessToken: formData.get("accessToken"),
    });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const shop = normaliseShopDomain(parsed.data.shop);
  if (!shop) {
    return {
      ok: false,
      errors: { shop: "That does not look like a Shopify domain. It should end in .myshopify.com." },
    };
  }

  const accessToken = parsed.data.accessToken;

  let info: ShopInfo;
  try {
    info = await shopifyGraphQL<ShopInfo>(shop, accessToken, SHOP_INFO_QUERY);
  } catch (error) {
    return {
      ok: false,
      message: `Shopify rejected that token: ${(error as Error).message}`,
    };
  }

  await prisma.store.update({
    where: { id: store.id },
    data: {
      shopifyDomain: shop,
      shopifyAccessToken: accessToken,
      shopifyScope: "custom-app",
      shopifyConnectedAt: new Date(),
    },
  });

  await ensureLeopardsCourier(store.id);

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Store",
    entityId: store.id,
    action: "UPDATE",
    summary: `Connected Shopify store ${info.shop.myshopifyDomain} with a custom app token`,
  });

  revalidatePath("/settings/shopify");
  revalidatePath("/");

  return {
    ok: true,
    message: `Connected to ${info.shop.name}. Run a sync to pull your orders in.`,
  };
}

export async function disconnectShopifyAction(): Promise<{ ok: boolean; message: string }> {
  const { user, store } = await requireContext();

  await prisma.store.update({
    where: { id: store.id },
    data: {
      shopifyDomain: null,
      shopifyAccessToken: null,
      shopifyScope: null,
      shopifyConnectedAt: null,
      shopifyLastSyncAt: null,
    },
  });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Store",
    entityId: store.id,
    action: "UPDATE",
    summary: "Disconnected Shopify",
  });

  revalidatePath("/settings/shopify");
  return {
    ok: true,
    message: "Shopify disconnected. Orders already imported are untouched.",
  };
}

export async function syncShopifyAction(includeProducts: boolean): Promise<{
  ok: boolean;
  message: string;
}> {
  const { user, store } = await requireContext();

  try {
    const result = await syncShopifyStore(store.id, { includeProducts });

    await recordAudit({
      storeId: store.id,
      userId: user.id,
      entity: "Store",
      entityId: store.id,
      action: "IMPORT",
      summary: `Shopify sync: ${result.ordersCreated} new orders, ${result.ordersUpdated} updated`,
    });

    revalidatePath("/settings/shopify");
    revalidatePath("/sales");
    revalidatePath("/products");
    revalidatePath("/");

    const parts = [
      `${result.ordersCreated} new order${result.ordersCreated === 1 ? "" : "s"}`,
      `${result.ordersUpdated} updated`,
    ];
    if (includeProducts) {
      parts.push(
        `${result.productsCreated} new product${result.productsCreated === 1 ? "" : "s"}`,
      );
    }

    return { ok: true, message: parts.join(", ") + "." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/**
 * Pulls the product catalogue only. Driven from the Products page, where
 * waiting on a year of orders to refresh a price would make no sense.
 */
export async function syncShopifyProductsAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  const { user, store } = await requireContext();

  const connected = await prisma.store.findUnique({
    where: { id: store.id },
    select: { shopifyDomain: true, shopifyAccessToken: true },
  });

  if (!connected?.shopifyDomain || !connected.shopifyAccessToken) {
    return {
      ok: false,
      message: "This store is not connected to Shopify yet. Connect it in Settings → Shopify.",
    };
  }

  try {
    const result = await syncShopifyProducts(store.id);

    await recordAudit({
      storeId: store.id,
      userId: user.id,
      entity: "Store",
      entityId: store.id,
      action: "IMPORT",
      summary: `Shopify catalogue sync: ${result.productsCreated} new, ${result.productsUpdated} updated`,
    });

    revalidatePath("/products");
    revalidatePath("/cogs");
    revalidatePath("/");

    const { productsCreated: created, productsUpdated: updated } = result;

    if (created === 0 && updated === 0) {
      return { ok: true, message: "Shopify returned no products for this store." };
    }

    return {
      ok: true,
      message: `${created} new product${created === 1 ? "" : "s"}, ${updated} updated.`,
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
