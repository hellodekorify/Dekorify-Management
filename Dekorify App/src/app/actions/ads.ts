"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { applyFxRate, FX_IDENTITY, parseFxRate, parseMoney } from "@/lib/money";
import { parseDateInput } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/currency";
import { AD_PLATFORMS } from "@/lib/constants";
import { firstErrors } from "@/lib/utils";
import type { FormState } from "./auth";

const PLATFORM_VALUES = AD_PLATFORMS.map((platform) => platform.value) as [string, ...string[]];

const schema = z.object({
  date: z.string().min(1, "Choose a date."),
  platform: z.enum(PLATFORM_VALUES),
  campaignName: z.string().trim().max(200).optional(),
  campaignId: z.string().trim().max(120).optional(),
  amount: z.string().min(1, "Enter an amount."),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]).default("PKR"),
  fxRate: z.string().optional(),
  impressions: z.string().optional(),
  clicks: z.string().optional(),
  conversions: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});

function optionalInt(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = Number.parseInt(value.replace(/,/g, ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readInput(formData: FormData, baseCurrency: string) {
  const parsed = schema.safeParse({
    date: formData.get("date"),
    platform: formData.get("platform"),
    campaignName: formData.get("campaignName") ?? undefined,
    campaignId: formData.get("campaignId") ?? undefined,
    amount: formData.get("amount"),
    currency: formData.get("currency") || baseCurrency,
    fxRate: formData.get("fxRate") ?? undefined,
    impressions: formData.get("impressions") ?? undefined,
    clicks: formData.get("clicks") ?? undefined,
    conversions: formData.get("conversions") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) } as FormState };
  }

  const date = parseDateInput(parsed.data.date);
  if (!date) return { error: { ok: false, errors: { date: "That is not a valid date." } } as FormState };

  const amountMinor = parseMoney(parsed.data.amount);
  if (amountMinor === null || amountMinor <= 0n) {
    return { error: { ok: false, errors: { amount: "Enter an amount greater than zero." } } as FormState };
  }

  const isBase = parsed.data.currency === baseCurrency;
  const fxRateE8 = isBase ? FX_IDENTITY : parseFxRate(parsed.data.fxRate);
  if (!isBase && fxRateE8 === null) {
    return {
      error: {
        ok: false,
        errors: { fxRate: `Enter the rate from ${parsed.data.currency} to ${baseCurrency}.` },
      } as FormState,
    };
  }

  return {
    data: {
      date,
      platform: parsed.data.platform,
      campaignName: parsed.data.campaignName || null,
      campaignId: parsed.data.campaignId || null,
      amountMinor,
      currency: parsed.data.currency,
      fxRateE8: fxRateE8!,
      baseAmountMinor: applyFxRate(amountMinor, fxRateE8!),
      impressions: optionalInt(parsed.data.impressions),
      clicks: optionalInt(parsed.data.clicks),
      conversions: optionalInt(parsed.data.conversions),
      notes: parsed.data.notes || null,
    },
  };
}

export async function createAdSpendAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireContext();

  const result = await readInput(formData, store.baseCurrency);
  if (result.error) return result.error;

  const entry = await prisma.adSpend.create({ data: { storeId: store.id, ...result.data! } });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "AdSpend",
    entityId: entry.id,
    action: "CREATE",
    summary: `Recorded ${entry.platform} spend`,
    after: entry,
  });

  revalidatePath("/ads");
  revalidatePath("/");
  return { ok: true, message: "Ad spend recorded." };
}

export async function updateAdSpendAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireContext();
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.adSpend.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That entry no longer exists." };

  const result = await readInput(formData, store.baseCurrency);
  if (result.error) return result.error;

  const updated = await prisma.adSpend.update({ where: { id }, data: result.data! });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "AdSpend",
    entityId: id,
    action: "UPDATE",
    summary: `Updated ${updated.platform} spend`,
    before: existing,
    after: updated,
  });

  revalidatePath("/ads");
  revalidatePath("/");
  return { ok: true, message: "Ad spend updated." };
}

export async function deleteAdSpendAction(id: string): Promise<{ ok: boolean; message: string }> {
  const { user, store } = await requireContext();

  const existing = await prisma.adSpend.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That entry no longer exists." };

  await prisma.adSpend.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "AdSpend",
    entityId: id,
    action: "DELETE",
    summary: `Deleted ${existing.platform} spend`,
    before: existing,
  });

  revalidatePath("/ads");
  revalidatePath("/");
  return { ok: true, message: "Ad spend deleted." };
}
