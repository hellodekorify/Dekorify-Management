"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
} from "@/app/actions/catalogue";
import { syncShopifyProductsAction } from "@/app/actions/shopify";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { RowActions } from "@/components/ui/row-actions";
import { Badge } from "@/components/ui/badge";
import { TD, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

export interface ProductRowData {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  sellingPriceInput: string;
  sellingPriceFormatted: string;
  unitCostInput: string;
  unitCostFormatted: string;
  profitPerUnitFormatted: string;
  marginPct: number | null;
  marginLabel: string;
  quantityOnHand: number;
  reorderLevel: number | null;
  lowStock: boolean;
  supplierId: string | null;
  supplierName: string | null;
  notes: string | null;
  unitsSold: number;
  revenueFormatted: string;
}

/**
 * Pulls the catalogue from Shopify. Disabled until the store is connected,
 * with the reason on the button itself rather than only on failure.
 */
export function SyncProductsButton({ connected }: { connected: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      loading={pending}
      disabled={!connected}
      title={
        connected
          ? "Pull the latest products, prices and stock from Shopify"
          : "Connect Shopify first, in Settings → Shopify"
      }
      onClick={() =>
        startTransition(async () => {
          const result = await syncShopifyProductsAction();
          toast({
            title: result.ok ? "Catalogue synced" : "Sync failed",
            description: result.message,
            variant: result.ok ? "success" : "error",
          });
          if (result.ok) router.refresh();
        })
      }
    >
      <RefreshCw className="h-4 w-4" aria-hidden />
      Sync from Shopify
    </Button>
  );
}

export function AddProductButton({
  suppliers,
  categories,
  baseCurrency,
}: {
  suppliers: { id: string; name: string }[];
  categories: string[];
  baseCurrency: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Add product
      </Button>
      {open && (
        <ProductDialog
          onClose={() => setOpen(false)}
          suppliers={suppliers}
          categories={categories}
          baseCurrency={baseCurrency}
        />
      )}
    </>
  );
}

export function ProductRow({
  product,
  suppliers,
  categories,
  baseCurrency,
}: {
  product: ProductRowData;
  suppliers: { id: string; name: string }[];
  categories: string[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm<ProductRowData>();

  async function handleDelete() {
    const result = await deleteProductAction(product.id);
    toast({
      title: result.ok ? "Product removed" : "Could not remove",
      description: result.message,
      variant: result.ok ? "success" : "error",
    });
    if (result.ok) router.refresh();
  }

  const marginTone =
    product.marginPct === null
      ? "neutral"
      : product.marginPct >= 50
        ? "positive"
        : product.marginPct >= 25
          ? "warning"
          : "negative";

  return (
    <>
      <TR>
        <TD>
          <span className="font-medium">{product.name}</span>
          {product.category && (
            <p className="mt-0.5 text-[12px] text-muted">{product.category}</p>
          )}
        </TD>
        <TD className="font-mono text-[12.5px] text-muted-strong">{product.sku ?? "—"}</TD>
        <TD className="text-[13px] text-muted-strong">{product.supplierName ?? "—"}</TD>
        <TD numeric align="right" className="text-muted-strong">
          {product.sellingPriceFormatted}
        </TD>
        <TD numeric align="right" className="text-muted-strong">
          {product.unitCostFormatted}
        </TD>
        <TD numeric align="right" className="font-medium">
          {product.profitPerUnitFormatted}
        </TD>
        <TD align="right">
          <Badge tone={marginTone}>{product.marginLabel}</Badge>
        </TD>
        <TD numeric align="right">
          <span className={product.lowStock ? "font-semibold text-negative" : ""}>
            {product.quantityOnHand.toLocaleString()}
          </span>
          {product.lowStock && (
            <span className="mt-0.5 block text-[11px] font-medium text-negative">Low</span>
          )}
        </TD>
        <TD numeric align="right" className="text-muted-strong">
          {product.unitsSold > 0 ? product.unitsSold.toLocaleString() : "—"}
        </TD>
        <TD align="right" className="w-10">
          <RowActions
            label={`Actions for ${product.name}`}
            actions={[
              { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
              {
                label: "Delete",
                icon: Trash2,
                tone: "danger",
                onSelect: () => confirm.ask(product),
              },
            ]}
          />
        </TD>
      </TR>

      {editing && (
        <ProductDialog
          product={product}
          onClose={() => setEditing(false)}
          suppliers={suppliers}
          categories={categories}
          baseCurrency={baseCurrency}
        />
      )}

      <ConfirmDialog
        open={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={handleDelete}
        title="Remove this product?"
        message={`"${product.name}" will be removed from your catalogue.`}
        detail={
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-[12.5px] leading-relaxed text-muted">
            Sales and COGS already recorded against it stay exactly as they are — your past
            reports will not change.
          </p>
        }
        confirmLabel="Remove"
      />
    </>
  );
}

function ProductDialog({
  product,
  onClose,
  suppliers,
  categories,
  baseCurrency,
}: {
  product?: ProductRowData;
  onClose: () => void;
  suppliers: { id: string; name: string }[];
  categories: string[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(product);

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updateProductAction : createProductAction,
    null,
  );

  const [price, setPrice] = useState(product?.sellingPriceInput ?? "");
  const [cost, setCost] = useState(product?.unitCostInput ?? "");

  useEffect(() => {
    if (state?.ok) {
      toast({ title: state.message ?? "Saved" });
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const toNumber = (value: string) => {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const priceNumber = toNumber(price);
  const costNumber = toNumber(cost);
  const profit = priceNumber - costNumber;
  const margin = priceNumber > 0 ? (profit / priceNumber) * 100 : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit product" : "Add a product"}
      description="Selling price minus unit cost gives the profit on every unit you sell."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" loading={pending}>
            {isEdit ? "Save changes" : "Add product"}
          </Button>
        </>
      }
    >
      <form id="product-form" action={formAction} className="space-y-4">
        {product && <input type="hidden" name="id" value={product.id} />}

        {state?.message && !state.ok && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-negative-border bg-negative-soft p-3"
          >
            <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-negative" aria-hidden />
            <p className="text-[13px] leading-snug text-negative">{state.message}</p>
          </div>
        )}

        <Input
          name="name"
          label="Product name"
          placeholder="LED Trendy Lamp - Black"
          required
          defaultValue={product?.name}
          error={state?.errors?.name}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            name="sku"
            label="SKU"
            placeholder="DK-TL-BLK"
            hint="Must be unique. Used to match imported rows to this product."
            defaultValue={product?.sku ?? ""}
            error={state?.errors?.sku}
          />
          <Input
            name="category"
            label="Category"
            placeholder="Lighting"
            list="product-categories"
            defaultValue={product?.category ?? ""}
          />
          <datalist id="product-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-muted p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              name="sellingPrice"
              inputMode="decimal"
              label={`Selling price (${baseCurrency})`}
              placeholder="0.00"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              error={state?.errors?.sellingPrice}
            />
            <Input
              name="unitCost"
              inputMode="decimal"
              label={`Unit cost (${baseCurrency})`}
              placeholder="0.00"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              error={state?.errors?.unitCost}
            />
          </div>

          <div className="mt-3 flex items-baseline justify-between border-t border-border-strong pt-3">
            <span className="text-[13px] font-semibold text-foreground">Profit per unit</span>
            <span className="flex items-baseline gap-3">
              <span
                className={
                  profit >= 0
                    ? "tabular text-[16px] font-semibold text-positive"
                    : "tabular text-[16px] font-semibold text-negative"
                }
              >
                {baseCurrency}{" "}
                {profit.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="tabular text-[13px] text-muted">
                {margin === null ? "—" : `${margin.toFixed(1)}% margin`}
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            name="quantityOnHand"
            type="number"
            label="Quantity in stock"
            defaultValue={product?.quantityOnHand ?? 0}
          />
          <Input
            name="reorderLevel"
            type="number"
            min={0}
            label="Reorder level"
            hint="Flagged when stock falls below."
            defaultValue={product?.reorderLevel ?? ""}
          />
          <Select
            name="supplierId"
            label="Supplier"
            defaultValue={product?.supplierId ?? ""}
            placeholder="Not specified"
            options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
          />
        </div>

        <Textarea name="notes" label="Notes" rows={2} defaultValue={product?.notes ?? ""} />
      </form>
    </Modal>
  );
}
