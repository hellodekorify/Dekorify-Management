"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { firstErrors } from "@/lib/utils";
import type { FormState } from "./auth";

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const productSchema = z.object({
  name: z.string().trim().min(1, "Enter the product name.").max(200),
  sku: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  sellingPrice: z.string().optional(),
  unitCost: z.string().optional(),
  quantityOnHand: z.string().optional(),
  reorderLevel: z.string().optional(),
  supplierId: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});

function readProduct(formData: FormData) {
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku") ?? undefined,
    category: formData.get("category") ?? undefined,
    sellingPrice: formData.get("sellingPrice") ?? undefined,
    unitCost: formData.get("unitCost") ?? undefined,
    quantityOnHand: formData.get("quantityOnHand") ?? undefined,
    reorderLevel: formData.get("reorderLevel") ?? undefined,
    supplierId: formData.get("supplierId") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) } as FormState };
  }

  const sellingPriceMinor = parseMoney(parsed.data.sellingPrice ?? "0") ?? 0n;
  const unitCostMinor = parseMoney(parsed.data.unitCost ?? "0") ?? 0n;

  if (sellingPriceMinor < 0n || unitCostMinor < 0n) {
    return { error: { ok: false, errors: { sellingPrice: "Prices cannot be negative." } } as FormState };
  }

  const quantity = Number.parseInt(parsed.data.quantityOnHand ?? "0", 10);
  const reorder = parsed.data.reorderLevel
    ? Number.parseInt(parsed.data.reorderLevel, 10)
    : null;

  return {
    data: {
      name: parsed.data.name,
      sku: parsed.data.sku || null,
      category: parsed.data.category || null,
      sellingPriceMinor,
      unitCostMinor,
      quantityOnHand: Number.isFinite(quantity) ? quantity : 0,
      reorderLevel: reorder !== null && Number.isFinite(reorder) ? reorder : null,
      supplierId: parsed.data.supplierId || null,
      notes: parsed.data.notes || null,
    },
  };
}

export async function createProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireContext();

  const result = readProduct(formData);
  if (result.error) return result.error;

  if (result.data!.sku) {
    const clash = await prisma.product.findFirst({
      where: { storeId: store.id, sku: result.data!.sku, deletedAt: null },
    });
    if (clash) {
      return { ok: false, errors: { sku: `SKU ${result.data!.sku} is already used by "${clash.name}".` } };
    }
  }

  const product = await prisma.product.create({ data: { storeId: store.id, ...result.data! } });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Product",
    entityId: product.id,
    action: "CREATE",
    summary: `Added product "${product.name}"`,
    after: product,
  });

  revalidatePath("/products");
  return { ok: true, message: "Product added." };
}

export async function updateProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireContext();
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.product.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That product no longer exists." };

  const result = readProduct(formData);
  if (result.error) return result.error;

  if (result.data!.sku) {
    const clash = await prisma.product.findFirst({
      where: { storeId: store.id, sku: result.data!.sku, deletedAt: null, id: { not: id } },
    });
    if (clash) {
      return { ok: false, errors: { sku: `SKU ${result.data!.sku} is already used by "${clash.name}".` } };
    }
  }

  const updated = await prisma.product.update({ where: { id }, data: result.data! });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Product",
    entityId: id,
    action: "UPDATE",
    summary: `Updated product "${updated.name}"`,
    before: existing,
    after: updated,
  });

  revalidatePath("/products");
  return { ok: true, message: "Product updated." };
}

export async function deleteProductAction(id: string): Promise<{ ok: boolean; message: string }> {
  const { user, store } = await requireContext();

  const existing = await prisma.product.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That product no longer exists." };

  await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Product",
    entityId: id,
    action: "DELETE",
    summary: `Deleted product "${existing.name}"`,
    before: existing,
  });

  revalidatePath("/products");
  return {
    ok: true,
    message: "Product removed. Sales and COGS already recorded against it are unaffected.",
  };
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

const supplierSchema = z.object({
  name: z.string().trim().min(1, "Enter the supplier name.").max(200),
  contactName: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  address: z.string().trim().max(400).optional(),
  city: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional(),
  openingBalance: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});

function readSupplier(formData: FormData) {
  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    contactName: formData.get("contactName") ?? undefined,
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    address: formData.get("address") ?? undefined,
    city: formData.get("city") ?? undefined,
    country: formData.get("country") ?? undefined,
    openingBalance: formData.get("openingBalance") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) } as FormState };
  }

  if (parsed.data.email && !z.string().email().safeParse(parsed.data.email).success) {
    return { error: { ok: false, errors: { email: "That does not look like an email address." } } as FormState };
  }

  return {
    data: {
      name: parsed.data.name,
      contactName: parsed.data.contactName || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      country: parsed.data.country || null,
      openingBalanceMinor: parseMoney(parsed.data.openingBalance ?? "0") ?? 0n,
      notes: parsed.data.notes || null,
    },
  };
}

export async function createSupplierAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { store } = await requireContext();

  const result = readSupplier(formData);
  if (result.error) return result.error;

  const clash = await prisma.supplier.findFirst({
    where: { storeId: store.id, name: result.data!.name, deletedAt: null },
  });
  if (clash) return { ok: false, errors: { name: "A supplier with that name already exists." } };

  await prisma.supplier.create({ data: { storeId: store.id, ...result.data! } });

  revalidatePath("/suppliers");
  return { ok: true, message: "Supplier added." };
}

export async function updateSupplierAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { store } = await requireContext();
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.supplier.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That supplier no longer exists." };

  const result = readSupplier(formData);
  if (result.error) return result.error;

  const clash = await prisma.supplier.findFirst({
    where: { storeId: store.id, name: result.data!.name, deletedAt: null, id: { not: id } },
  });
  if (clash) return { ok: false, errors: { name: "A supplier with that name already exists." } };

  await prisma.supplier.update({ where: { id }, data: result.data! });

  revalidatePath("/suppliers");
  return { ok: true, message: "Supplier updated." };
}

export async function deleteSupplierAction(id: string): Promise<{ ok: boolean; message: string }> {
  const { store } = await requireContext();

  const existing = await prisma.supplier.findFirst({ where: { id, storeId: store.id } });
  if (!existing) return { ok: false, message: "That supplier no longer exists." };

  await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath("/suppliers");
  return { ok: true, message: "Supplier removed. Their purchase history is kept." };
}

export async function recordSupplierPaymentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { store } = await requireContext();
  const supplierId = String(formData.get("supplierId") ?? "");

  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, storeId: store.id } });
  if (!supplier) return { ok: false, message: "That supplier no longer exists." };

  const amountMinor = parseMoney(formData.get("amount"));
  if (amountMinor === null || amountMinor <= 0n) {
    return { ok: false, errors: { amount: "Enter an amount greater than zero." } };
  }

  const dateValue = String(formData.get("date") ?? "");
  const date = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(date.getTime())) {
    return { ok: false, errors: { date: "That is not a valid date." } };
  }

  await prisma.supplierPayment.create({
    data: {
      supplierId,
      date,
      amountMinor,
      currency: store.baseCurrency,
      baseAmountMinor: amountMinor,
      method: String(formData.get("method") ?? "") || null,
      reference: String(formData.get("reference") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
    },
  });

  revalidatePath("/suppliers");
  return { ok: true, message: "Payment recorded." };
}
