"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { applyFxRate, FX_IDENTITY, parseFxRate, parseMoney } from "@/lib/money";
import { parseDateInput } from "@/lib/dates";
import { storeReceipt } from "@/lib/storage";
import { CURRENCY_CODES } from "@/lib/currency";
import { firstErrors } from "@/lib/utils";
import type { FormState } from "./auth";

const expenseSchema = z.object({
  date: z.string().min(1, "Choose a date."),
  name: z.string().trim().min(1, "Give the expense a name.").max(200),
  amount: z.string().min(1, "Enter an amount."),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]).default("PKR"),
  fxRate: z.string().optional(),
  categoryId: z.string().optional(),
  paymentMethod: z.string().optional(),
  vendorName: z.string().trim().max(200).optional(),
  supplierId: z.string().optional(),
  description: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** Shared parsing for create and update, including FX conversion to base. */
async function readExpenseInput(formData: FormData, baseCurrency: string) {
  const parsed = expenseSchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || baseCurrency,
    fxRate: formData.get("fxRate") ?? undefined,
    categoryId: formData.get("categoryId") ?? undefined,
    paymentMethod: formData.get("paymentMethod") ?? undefined,
    vendorName: formData.get("vendorName") ?? undefined,
    supplierId: formData.get("supplierId") ?? undefined,
    description: formData.get("description") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) } as FormState };
  }

  const date = parseDateInput(parsed.data.date);
  if (!date) return { error: { ok: false, errors: { date: "That is not a valid date." } } as FormState };

  const amountMinor = parseMoney(parsed.data.amount);
  if (amountMinor === null) {
    return { error: { ok: false, errors: { amount: "Enter a valid amount." } } as FormState };
  }
  if (amountMinor <= 0n) {
    return { error: { ok: false, errors: { amount: "The amount must be greater than zero." } } as FormState };
  }

  const isBase = parsed.data.currency === baseCurrency;
  const fxRateE8 = isBase ? FX_IDENTITY : (parseFxRate(parsed.data.fxRate) ?? null);

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
      name: parsed.data.name,
      amountMinor,
      currency: parsed.data.currency,
      fxRateE8: fxRateE8!,
      baseAmountMinor: applyFxRate(amountMinor, fxRateE8!),
      categoryId: parsed.data.categoryId || null,
      paymentMethod: parsed.data.paymentMethod || null,
      vendorName: parsed.data.vendorName || null,
      supplierId: parsed.data.supplierId || null,
      description: parsed.data.description || null,
      notes: parsed.data.notes || null,
    },
  };
}

export async function createExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireContext();

  const result = await readExpenseInput(formData, store.baseCurrency);
  if (result.error) return result.error;

  let receiptPath: string | null = null;
  let receiptFileName: string | null = null;

  const receipt = formData.get("receipt");
  if (receipt instanceof File && receipt.size > 0) {
    try {
      const stored = await storeReceipt(receipt, store.id);
      receiptPath = stored.relativePath;
      receiptFileName = stored.fileName;
    } catch (error) {
      return { ok: false, errors: { receipt: (error as Error).message } };
    }
  }

  const expense = await prisma.expense.create({
    data: { storeId: store.id, ...result.data!, receiptPath, receiptFileName },
  });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Expense",
    entityId: expense.id,
    action: "CREATE",
    summary: `Added expense "${expense.name}"`,
    after: expense,
  });

  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true, message: "Expense added." };
}

export async function updateExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireContext();
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.expense.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That expense no longer exists." };

  const result = await readExpenseInput(formData, store.baseCurrency);
  if (result.error) return result.error;

  let receiptPath = existing.receiptPath;
  let receiptFileName = existing.receiptFileName;

  const receipt = formData.get("receipt");
  if (receipt instanceof File && receipt.size > 0) {
    try {
      const stored = await storeReceipt(receipt, store.id);
      receiptPath = stored.relativePath;
      receiptFileName = stored.fileName;
    } catch (error) {
      return { ok: false, errors: { receipt: (error as Error).message } };
    }
  }

  const updated = await prisma.expense.update({
    where: { id },
    data: { ...result.data!, receiptPath, receiptFileName },
  });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Expense",
    entityId: id,
    action: "UPDATE",
    summary: `Updated expense "${updated.name}"`,
    before: existing,
    after: updated,
  });

  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true, message: "Expense updated." };
}

export async function deleteExpenseAction(id: string): Promise<{ ok: boolean; message: string }> {
  const { user, store } = await requireContext();

  const existing = await prisma.expense.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That expense no longer exists." };

  // Soft delete — financial records stay recoverable and auditable.
  await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Expense",
    entityId: id,
    action: "DELETE",
    summary: `Deleted expense "${existing.name}"`,
    before: existing,
  });

  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true, message: "Expense deleted." };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().trim().min(1, "Give the category a name.").max(80),
  kind: z.enum(["FULFILMENT", "OPERATING", "OTHER"]),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour.").optional(),
});

export async function createCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireContext();

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    color: formData.get("color") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const clash = await prisma.expenseCategory.findFirst({
    where: { storeId: store.id, name: parsed.data.name },
  });
  if (clash) return { ok: false, errors: { name: "A category with that name already exists." } };

  const last = await prisma.expenseCategory.findFirst({
    where: { storeId: store.id },
    orderBy: { sortOrder: "desc" },
  });

  await prisma.expenseCategory.create({
    data: {
      storeId: store.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      color: parsed.data.color ?? "#94a3b8",
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  revalidatePath("/expenses/categories");
  revalidatePath("/expenses");
  return { ok: true, message: "Category created." };
}

export async function updateCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireContext();
  const id = String(formData.get("id") ?? "");

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    color: formData.get("color") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const existing = await prisma.expenseCategory.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That category no longer exists." };

  const clash = await prisma.expenseCategory.findFirst({
    where: { storeId: store.id, name: parsed.data.name, id: { not: id } },
  });
  if (clash) return { ok: false, errors: { name: "A category with that name already exists." } };

  await prisma.expenseCategory.update({ where: { id }, data: parsed.data });

  revalidatePath("/expenses/categories");
  revalidatePath("/expenses");
  revalidatePath("/profit-loss");
  return { ok: true, message: "Category updated." };
}

export async function deleteCategoryAction(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  const { store } = await requireContext();

  const existing = await prisma.expenseCategory.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That category no longer exists." };

  const inUse = await prisma.expense.count({
    where: { categoryId: id, deletedAt: null },
  });

  if (inUse > 0) {
    return {
      ok: false,
      message: `${inUse} expense${inUse === 1 ? "" : "s"} still use this category. Move them first, then delete it.`,
    };
  }

  await prisma.expenseCategory.delete({ where: { id } });

  revalidatePath("/expenses/categories");
  revalidatePath("/expenses");
  return { ok: true, message: "Category deleted." };
}

export async function reorderCategoriesAction(
  orderedIds: string[],
): Promise<{ ok: boolean; message: string }> {
  const { store } = await requireContext();

  const owned = await prisma.expenseCategory.findMany({
    where: { storeId: store.id, id: { in: orderedIds } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((row) => row.id));

  await prisma.$transaction(
    orderedIds
      .filter((id) => ownedIds.has(id))
      .map((id, index) =>
        prisma.expenseCategory.update({ where: { id }, data: { sortOrder: index } }),
      ),
  );

  revalidatePath("/expenses/categories");
  return { ok: true, message: "Order saved." };
}
