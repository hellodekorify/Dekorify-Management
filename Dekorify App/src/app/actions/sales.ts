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

const schema = z.object({
  date: z.string().min(1, "Choose a date."),
  orderId: z.string().trim().min(1, "Enter an order reference.").max(120),
  customerName: z.string().trim().max(200).optional(),
  channel: z.string().trim().min(1).max(60).default("Shopify"),
  productId: z.string().optional(),
  productName: z.string().trim().max(200).optional(),
  sku: z.string().trim().max(80).optional(),
  quantity: z.string().optional(),
  grossAmount: z.string().min(1, "Enter the sales amount."),
  discount: z.string().optional(),
  refund: z.string().optional(),
  shippingRevenue: z.string().optional(),
  paymentFee: z.string().optional(),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]).default("PKR"),
  fxRate: z.string().optional(),
  financialStatus: z.string().optional(),
  fulfillmentStatus: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});

function optionalMoney(value: string | undefined): bigint | null {
  if (!value || value.trim() === "") return 0n;
  return parseMoney(value);
}

async function readInput(formData: FormData, baseCurrency: string) {
  const parsed = schema.safeParse({
    date: formData.get("date"),
    orderId: formData.get("orderId"),
    customerName: formData.get("customerName") ?? undefined,
    channel: formData.get("channel") || "Shopify",
    productId: formData.get("productId") ?? undefined,
    productName: formData.get("productName") ?? undefined,
    sku: formData.get("sku") ?? undefined,
    quantity: formData.get("quantity") ?? undefined,
    grossAmount: formData.get("grossAmount"),
    discount: formData.get("discount") ?? undefined,
    refund: formData.get("refund") ?? undefined,
    shippingRevenue: formData.get("shippingRevenue") ?? undefined,
    paymentFee: formData.get("paymentFee") ?? undefined,
    currency: formData.get("currency") || baseCurrency,
    fxRate: formData.get("fxRate") ?? undefined,
    financialStatus: formData.get("financialStatus") ?? undefined,
    fulfillmentStatus: formData.get("fulfillmentStatus") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) } as FormState };
  }

  const date = parseDateInput(parsed.data.date);
  if (!date) return { error: { ok: false, errors: { date: "That is not a valid date." } } as FormState };

  const grossAmountMinor = parseMoney(parsed.data.grossAmount);
  if (grossAmountMinor === null || grossAmountMinor < 0n) {
    return { error: { ok: false, errors: { grossAmount: "Enter a valid sales amount." } } as FormState };
  }

  const discountMinor = optionalMoney(parsed.data.discount);
  const refundMinor = optionalMoney(parsed.data.refund);
  const shippingRevenueMinor = optionalMoney(parsed.data.shippingRevenue);
  const paymentFeeMinor = optionalMoney(parsed.data.paymentFee);

  for (const [field, value] of [
    ["discount", discountMinor],
    ["refund", refundMinor],
    ["shippingRevenue", shippingRevenueMinor],
    ["paymentFee", paymentFeeMinor],
  ] as const) {
    if (value === null || value < 0n) {
      return { error: { ok: false, errors: { [field]: "Enter a valid amount, or leave it blank." } } as FormState };
    }
  }

  if (discountMinor! + refundMinor! > grossAmountMinor + shippingRevenueMinor!) {
    return {
      error: {
        ok: false,
        errors: {
          refund: "Discounts and refunds together exceed the order value. Check the figures.",
        },
      } as FormState,
    };
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

  const quantity = Math.max(1, Number.parseInt(parsed.data.quantity ?? "1", 10) || 1);
  const isCancelled = parsed.data.fulfillmentStatus === "CANCELLED";

  // Revenue is derived, never entered. A cancelled or returned order earns nothing.
  const earnsRevenue =
    !isCancelled && parsed.data.fulfillmentStatus !== "RETURNED";

  const netRevenueMinor = earnsRevenue
    ? grossAmountMinor - discountMinor! - refundMinor! + shippingRevenueMinor!
    : 0n;

  return {
    data: {
      date,
      orderId: parsed.data.orderId,
      customerName: parsed.data.customerName || null,
      channel: parsed.data.channel,
      productId: parsed.data.productId || null,
      productName: parsed.data.productName || null,
      sku: parsed.data.sku || null,
      quantity,
      grossAmountMinor,
      discountMinor: discountMinor!,
      refundMinor: refundMinor!,
      shippingRevenueMinor: shippingRevenueMinor!,
      paymentFeeMinor: earnsRevenue ? paymentFeeMinor! : 0n,
      netRevenueMinor,
      currency: parsed.data.currency,
      fxRateE8: fxRateE8!,
      baseNetRevenueMinor: applyFxRate(netRevenueMinor, fxRateE8!),
      financialStatus: parsed.data.financialStatus || null,
      fulfillmentStatus: parsed.data.fulfillmentStatus || null,
      isCancelled,
      notes: parsed.data.notes || null,
    },
  };
}

export async function createSaleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireContext();

  const result = await readInput(formData, store.baseCurrency);
  if (result.error) return result.error;

  // The same order recorded twice would double the revenue, so block it.
  const duplicate = await prisma.sale.findFirst({
    where: { storeId: store.id, orderId: result.data!.orderId, deletedAt: null },
  });
  if (duplicate) {
    return {
      ok: false,
      errors: {
        orderId: `Order ${result.data!.orderId} is already recorded. Edit that entry instead of adding it again.`,
      },
    };
  }

  const sale = await prisma.sale.create({ data: { storeId: store.id, ...result.data! } });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Sale",
    entityId: sale.id,
    action: "CREATE",
    summary: `Recorded order ${sale.orderId}`,
    after: sale,
  });

  revalidatePath("/sales");
  revalidatePath("/");
  return { ok: true, message: "Sale recorded." };
}

export async function updateSaleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireContext();
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.sale.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That sale no longer exists." };

  const result = await readInput(formData, store.baseCurrency);
  if (result.error) return result.error;

  const duplicate = await prisma.sale.findFirst({
    where: {
      storeId: store.id,
      orderId: result.data!.orderId,
      deletedAt: null,
      id: { not: id },
    },
  });
  if (duplicate) {
    return {
      ok: false,
      errors: { orderId: `Another entry already uses order ${result.data!.orderId}.` },
    };
  }

  const updated = await prisma.sale.update({ where: { id }, data: result.data! });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Sale",
    entityId: id,
    action: "UPDATE",
    summary: `Updated order ${updated.orderId}`,
    before: existing,
    after: updated,
  });

  revalidatePath("/sales");
  revalidatePath("/");
  return { ok: true, message: "Sale updated." };
}

export async function deleteSaleAction(id: string): Promise<{ ok: boolean; message: string }> {
  const { user, store } = await requireContext();

  const existing = await prisma.sale.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That sale no longer exists." };

  await prisma.sale.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Sale",
    entityId: id,
    action: "DELETE",
    summary: `Deleted order ${existing.orderId}`,
    before: existing,
  });

  revalidatePath("/sales");
  revalidatePath("/");
  return { ok: true, message: "Sale deleted." };
}
