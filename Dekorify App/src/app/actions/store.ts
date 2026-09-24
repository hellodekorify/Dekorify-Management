"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ACTIVE_STORE_COOKIE, assertStoreAccess, requireContext, requireUser } from "@/lib/auth";
import { createStoreForUser } from "@/lib/store-setup";
import { firstErrors } from "@/lib/utils";
import { CURRENCY_CODES } from "@/lib/currency";
import type { FormState } from "./auth";

export async function switchStoreAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const storeId = String(formData.get("storeId") ?? "");

  await assertStoreAccess(user.id, storeId);

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86_400,
  });

  revalidatePath("/", "layout");
  redirect("/");
}

const storeSchema = z.object({
  name: z.string().trim().min(2, "Enter a store name.").max(120),
  baseCurrency: z.enum(CURRENCY_CODES as [string, ...string[]]),
  timezone: z.string().trim().min(1).default("Asia/Karachi"),
});

export async function createStoreAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = storeSchema.safeParse({
    name: formData.get("name"),
    baseCurrency: formData.get("baseCurrency"),
    timezone: formData.get("timezone") || "Asia/Karachi",
  });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const storeId = await createStoreForUser(user.id, parsed.data);

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86_400,
  });

  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateStoreAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireContext();

  const parsed = storeSchema.safeParse({
    name: formData.get("name"),
    baseCurrency: formData.get("baseCurrency"),
    timezone: formData.get("timezone") || "Asia/Karachi",
  });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  await prisma.store.update({ where: { id: store.id }, data: parsed.data });

  revalidatePath("/", "layout");
  return { ok: true, message: "Store settings saved." };
}
