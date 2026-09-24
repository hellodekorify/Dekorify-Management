"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { applyFxRate, FX_IDENTITY, parseFxRate, parseMoney } from "@/lib/money";
import { parseDateInput } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/currency";
import { firstErrors } from "@/lib/utils";
import type { FormState } from "./auth";

// ---------------------------------------------------------------------------
// Cash accounts (opening balances)
// ---------------------------------------------------------------------------

const accountSchema = z.object({
  name: z.string().trim().min(1, "Give the account a name.").max(120),
  type: z.enum(["BANK", "CASH", "WALLET"]),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]),
  openingBalance: z.string().optional(),
  openingDate: z.string().min(1, "Choose the date this balance applies from."),
});

export async function saveCashAccountAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { store } = await requireContext();
  const id = String(formData.get("id") ?? "");

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency") || store.baseCurrency,
    openingBalance: formData.get("openingBalance") ?? undefined,
    openingDate: formData.get("openingDate"),
  });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const openingDate = parseDateInput(parsed.data.openingDate);
  if (!openingDate) {
    return { ok: false, errors: { openingDate: "That is not a valid date." } };
  }

  const openingBalanceMinor = parseMoney(parsed.data.openingBalance ?? "0") ?? 0n;

  const data = {
    name: parsed.data.name,
    type: parsed.data.type,
    currency: parsed.data.currency,
    openingBalanceMinor,
    openingDate,
  };

  if (id) {
    const existing = await prisma.cashAccount.findFirst({ where: { id, storeId: store.id } });
    if (!existing) return { ok: false, message: "That account no longer exists." };
    await prisma.cashAccount.update({ where: { id }, data });
  } else {
    await prisma.cashAccount.create({ data: { storeId: store.id, ...data } });
  }

  revalidatePath("/cash-flow");
  revalidatePath("/");
  return { ok: true, message: id ? "Account updated." : "Account added." };
}

export async function deleteCashAccountAction(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  const { store } = await requireContext();

  const existing = await prisma.cashAccount.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That account no longer exists." };

  const remaining = await prisma.cashAccount.count({
    where: { storeId: store.id, deletedAt: null },
  });
  if (remaining <= 1) {
    return {
      ok: false,
      message: "Keep at least one account — the cash flow statement needs an opening balance.",
    };
  }

  await prisma.cashAccount.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath("/cash-flow");
  return { ok: true, message: "Account removed." };
}

// ---------------------------------------------------------------------------
// Manual cash movements
// ---------------------------------------------------------------------------

const entrySchema = z.object({
  date: z.string().min(1, "Choose a date."),
  direction: z.enum(["IN", "OUT"]),
  category: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1, "Describe this movement.").max(200),
  amount: z.string().min(1, "Enter an amount."),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]).default("PKR"),
  fxRate: z.string().optional(),
  accountId: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});

async function readEntry(formData: FormData, baseCurrency: string) {
  const parsed = entrySchema.safeParse({
    date: formData.get("date"),
    direction: formData.get("direction"),
    category: formData.get("category") || "OTHER",
    name: formData.get("name"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || baseCurrency,
    fxRate: formData.get("fxRate") ?? undefined,
    accountId: formData.get("accountId") ?? undefined,
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
      direction: parsed.data.direction,
      category: parsed.data.category,
      name: parsed.data.name,
      amountMinor,
      currency: parsed.data.currency,
      fxRateE8: fxRateE8!,
      baseAmountMinor: applyFxRate(amountMinor, fxRateE8!),
      accountId: parsed.data.accountId || null,
      notes: parsed.data.notes || null,
    },
  };
}

export async function createCashEntryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, store } = await requireContext();

  const result = await readEntry(formData, store.baseCurrency);
  if (result.error) return result.error;

  const entry = await prisma.cashEntry.create({ data: { storeId: store.id, ...result.data! } });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "CashEntry",
    entityId: entry.id,
    action: "CREATE",
    summary: `Recorded cash ${entry.direction === "IN" ? "in" : "out"}: ${entry.name}`,
    after: entry,
  });

  revalidatePath("/cash-flow");
  revalidatePath("/");
  return { ok: true, message: "Cash movement recorded." };
}

export async function updateCashEntryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { store } = await requireContext();
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.cashEntry.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That entry no longer exists." };

  const result = await readEntry(formData, store.baseCurrency);
  if (result.error) return result.error;

  await prisma.cashEntry.update({ where: { id }, data: result.data! });

  revalidatePath("/cash-flow");
  revalidatePath("/");
  return { ok: true, message: "Cash movement updated." };
}

export async function deleteCashEntryAction(id: string): Promise<{ ok: boolean; message: string }> {
  const { user, store } = await requireContext();

  const existing = await prisma.cashEntry.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That entry no longer exists." };

  await prisma.cashEntry.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "CashEntry",
    entityId: id,
    action: "DELETE",
    summary: `Deleted cash movement "${existing.name}"`,
    before: existing,
  });

  revalidatePath("/cash-flow");
  revalidatePath("/");
  return { ok: true, message: "Cash movement deleted." };
}
