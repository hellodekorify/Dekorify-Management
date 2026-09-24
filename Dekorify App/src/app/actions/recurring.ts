"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { applyFxRate, FX_IDENTITY, parseFxRate, parseMoney } from "@/lib/money";
import { parseDateInput } from "@/lib/dates";
import { dueOccurrences } from "@/lib/recurring";
import { CURRENCY_CODES } from "@/lib/currency";
import { firstErrors } from "@/lib/utils";
import type { FormState } from "./auth";

const schema = z.object({
  name: z.string().trim().min(1, "Give the recurring expense a name.").max(200),
  amount: z.string().min(1, "Enter an amount."),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]).default("PKR"),
  fxRate: z.string().optional(),
  categoryId: z.string().optional(),
  frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  startDate: z.string().min(1, "Choose a start date."),
  endDate: z.string().optional(),
  dayOfMonth: z.string().optional(),
  paymentMethod: z.string().optional(),
  vendorName: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

async function readInput(formData: FormData, baseCurrency: string) {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || baseCurrency,
    fxRate: formData.get("fxRate") ?? undefined,
    categoryId: formData.get("categoryId") ?? undefined,
    frequency: formData.get("frequency"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") ?? undefined,
    dayOfMonth: formData.get("dayOfMonth") ?? undefined,
    paymentMethod: formData.get("paymentMethod") ?? undefined,
    vendorName: formData.get("vendorName") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) } as FormState };
  }

  const startDate = parseDateInput(parsed.data.startDate);
  if (!startDate) {
    return { error: { ok: false, errors: { startDate: "That is not a valid date." } } as FormState };
  }

  const endDate = parsed.data.endDate ? parseDateInput(parsed.data.endDate) : null;
  if (parsed.data.endDate && !endDate) {
    return { error: { ok: false, errors: { endDate: "That is not a valid date." } } as FormState };
  }
  if (endDate && endDate < startDate) {
    return {
      error: { ok: false, errors: { endDate: "The end date must be after the start date." } } as FormState,
    };
  }

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

  const dayOfMonth = parsed.data.dayOfMonth ? Number.parseInt(parsed.data.dayOfMonth, 10) : null;

  return {
    data: {
      name: parsed.data.name,
      amountMinor,
      currency: parsed.data.currency,
      fxRateE8: fxRateE8!,
      baseAmountMinor: applyFxRate(amountMinor, fxRateE8!),
      categoryId: parsed.data.categoryId || null,
      frequency: parsed.data.frequency,
      startDate,
      endDate,
      dayOfMonth:
        dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31 ? dayOfMonth : startDate.getDate(),
      paymentMethod: parsed.data.paymentMethod || null,
      vendorName: parsed.data.vendorName || null,
      notes: parsed.data.notes || null,
    },
  };
}

export async function createRecurringAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireContext();

  const result = await readInput(formData, store.baseCurrency);
  if (result.error) return result.error;

  await prisma.recurringExpense.create({
    data: { storeId: store.id, ...result.data!, isActive: true },
  });

  revalidatePath("/expenses/recurring");
  return { ok: true, message: "Recurring expense created." };
}

export async function updateRecurringAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireContext();
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.recurringExpense.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That schedule no longer exists." };

  const result = await readInput(formData, store.baseCurrency);
  if (result.error) return result.error;

  await prisma.recurringExpense.update({ where: { id }, data: result.data! });

  revalidatePath("/expenses/recurring");
  return { ok: true, message: "Recurring expense updated." };
}

export async function toggleRecurringAction(
  id: string,
  isActive: boolean,
): Promise<{ ok: boolean; message: string }> {
  const { store } = await requireContext();

  const existing = await prisma.recurringExpense.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That schedule no longer exists." };

  await prisma.recurringExpense.update({ where: { id }, data: { isActive } });

  revalidatePath("/expenses/recurring");
  return { ok: true, message: isActive ? "Schedule resumed." : "Schedule paused." };
}

export async function deleteRecurringAction(id: string): Promise<{ ok: boolean; message: string }> {
  const { store } = await requireContext();

  const existing = await prisma.recurringExpense.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That schedule no longer exists." };

  await prisma.recurringExpense.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });

  revalidatePath("/expenses/recurring");
  return { ok: true, message: "Schedule deleted. Expenses already posted are unaffected." };
}

/**
 * Posts every occurrence that has fallen due. Deliberately a button rather
 * than a background job: creating financial records is the owner's decision,
 * and this way the count is visible before anything is written.
 */
export async function postDueRecurringAction(): Promise<{
  ok: boolean;
  message: string;
  created: number;
}> {
  const { user, store } = await requireContext();

  const schedules = await prisma.recurringExpense.findMany({
    where: { storeId: store.id, isActive: true, deletedAt: null },
  });

  const now = new Date();
  let created = 0;

  await prisma.$transaction(async (tx) => {
    for (const schedule of schedules) {
      const occurrences = dueOccurrences(schedule, now);
      if (occurrences.length === 0) continue;

      await tx.expense.createMany({
        data: occurrences.map((date) => ({
          storeId: store.id,
          date,
          name: schedule.name,
          categoryId: schedule.categoryId,
          amountMinor: schedule.amountMinor,
          currency: schedule.currency,
          fxRateE8: schedule.fxRateE8,
          baseAmountMinor: schedule.baseAmountMinor,
          paymentMethod: schedule.paymentMethod,
          vendorName: schedule.vendorName,
          notes: schedule.notes,
          recurringExpenseId: schedule.id,
        })),
      });

      await tx.recurringExpense.update({
        where: { id: schedule.id },
        data: { lastGeneratedDate: occurrences[occurrences.length - 1] },
      });

      created += occurrences.length;
    }
  });

  if (created > 0) {
    await recordAudit({
      storeId: store.id,
      userId: user.id,
      entity: "RecurringExpense",
      entityId: "batch",
      action: "CREATE",
      summary: `Posted ${created} recurring expense entr${created === 1 ? "y" : "ies"}`,
    });
  }

  revalidatePath("/expenses");
  revalidatePath("/expenses/recurring");
  revalidatePath("/");

  return {
    ok: true,
    created,
    message:
      created === 0
        ? "Nothing is due right now."
        : `Posted ${created} expense${created === 1 ? "" : "s"}.`,
  };
}
