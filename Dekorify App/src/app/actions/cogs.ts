"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { applyFxRate, FX_IDENTITY, multiplyByQuantity, parseFxRate, parseMoney } from "@/lib/money";
import { parseDateInput } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/currency";
import { firstErrors } from "@/lib/utils";
import type { FormState } from "./auth";

const schema = z.object({
  date: z.string().min(1, "Choose a date."),
  productId: z.string().optional(),
  productName: z.string().trim().min(1, "Enter the product name.").max(200),
  sku: z.string().trim().max(80).optional(),
  supplierId: z.string().optional(),
  quantity: z.string().min(1, "Enter a quantity."),
  unitCost: z.string().min(1, "Enter the unit cost."),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]).default("PKR"),
  fxRate: z.string().optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

async function readInput(formData: FormData, baseCurrency: string) {
  const parsed = schema.safeParse({
    date: formData.get("date"),
    productId: formData.get("productId") ?? undefined,
    productName: formData.get("productName"),
    sku: formData.get("sku") ?? undefined,
    supplierId: formData.get("supplierId") ?? undefined,
    quantity: formData.get("quantity"),
    unitCost: formData.get("unitCost"),
    currency: formData.get("currency") || baseCurrency,
    fxRate: formData.get("fxRate") ?? undefined,
    reference: formData.get("reference") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) } as FormState };
  }

  const date = parseDateInput(parsed.data.date);
  if (!date) return { error: { ok: false, errors: { date: "That is not a valid date." } } as FormState };

  const quantity = Number.parseInt(parsed.data.quantity, 10);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      error: { ok: false, errors: { quantity: "Quantity must be a whole number above zero." } } as FormState,
    };
  }

  const unitCostMinor = parseMoney(parsed.data.unitCost);
  if (unitCostMinor === null || unitCostMinor < 0n) {
    return { error: { ok: false, errors: { unitCost: "Enter a valid unit cost." } } as FormState };
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

  // Total cost is always derived, never taken from the form.
  const totalCostMinor = multiplyByQuantity(unitCostMinor, quantity);

  return {
    data: {
      date,
      productId: parsed.data.productId || null,
      productName: parsed.data.productName,
      sku: parsed.data.sku || null,
      supplierId: parsed.data.supplierId || null,
      quantity,
      unitCostMinor,
      totalCostMinor,
      currency: parsed.data.currency,
      fxRateE8: fxRateE8!,
      baseTotalCostMinor: applyFxRate(totalCostMinor, fxRateE8!),
      reference: parsed.data.reference || null,
      notes: parsed.data.notes || null,
    },
  };
}

export async function createCogsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireContext();

  const result = await readInput(formData, store.baseCurrency);
  if (result.error) return result.error;

  const entry = await prisma.cogsEntry.create({
    data: { storeId: store.id, ...result.data! },
  });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "CogsEntry",
    entityId: entry.id,
    action: "CREATE",
    summary: `Recorded ${entry.quantity} × ${entry.productName}`,
    after: entry,
  });

  revalidatePath("/cogs");
  revalidatePath("/");
  return { ok: true, message: "COGS entry added." };
}

export async function updateCogsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireContext();
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.cogsEntry.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That entry no longer exists." };

  const result = await readInput(formData, store.baseCurrency);
  if (result.error) return result.error;

  const updated = await prisma.cogsEntry.update({ where: { id }, data: result.data! });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "CogsEntry",
    entityId: id,
    action: "UPDATE",
    summary: `Updated COGS for ${updated.productName}`,
    before: existing,
    after: updated,
  });

  revalidatePath("/cogs");
  revalidatePath("/");
  return { ok: true, message: "COGS entry updated." };
}

export async function deleteCogsAction(id: string): Promise<{ ok: boolean; message: string }> {
  const { user, store } = await requireContext();

  const existing = await prisma.cogsEntry.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That entry no longer exists." };

  await prisma.cogsEntry.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "CogsEntry",
    entityId: id,
    action: "DELETE",
    summary: `Deleted COGS entry for ${existing.productName}`,
    before: existing,
  });

  revalidatePath("/cogs");
  revalidatePath("/");
  return { ok: true, message: "COGS entry deleted." };
}
