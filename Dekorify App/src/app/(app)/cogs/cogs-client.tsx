"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { createCogsAction, deleteCogsAction, updateCogsAction } from "@/app/actions/cogs";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { RowActions } from "@/components/ui/row-actions";
import { TD, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { CURRENCY_CODES } from "@/lib/currency";

export interface CogsRowData {
  id: string;
  date: string;
  dateInput: string;
  productId: string | null;
  productName: string;
  sku: string | null;
  supplierId: string | null;
  supplierName: string | null;
  quantity: number;
  unitCostInput: string;
  unitCostFormatted: string;
  totalFormatted: string;
  currency: string;
  fxRateInput: string;
  isForeign: boolean;
  baseTotalFormatted: string;
  reference: string | null;
  notes: string | null;
}

export interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  unitCostInput: string;
  supplierId: string | null;
}

export function AddCogsButton({
  products,
  suppliers,
  baseCurrency,
}: {
  products: ProductOption[];
  suppliers: { id: string; name: string }[];
  baseCurrency: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Record COGS
      </Button>
      {open && (
        <CogsDialog
          onClose={() => setOpen(false)}
          products={products}
          suppliers={suppliers}
          baseCurrency={baseCurrency}
        />
      )}
    </>
  );
}

export function CogsRow({
  entry,
  products,
  suppliers,
  baseCurrency,
}: {
  entry: CogsRowData;
  products: ProductOption[];
  suppliers: { id: string; name: string }[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm<CogsRowData>();

  async function handleDelete() {
    const result = await deleteCogsAction(entry.id);
    toast({
      title: result.ok ? "Entry deleted" : "Could not delete",
      description: result.ok ? undefined : result.message,
      variant: result.ok ? "success" : "error",
    });
    if (result.ok) router.refresh();
  }

  return (
    <>
      <TR>
        <TD numeric className="text-muted-strong">
          {entry.date}
        </TD>
        <TD>
          <span className="font-medium">{entry.productName}</span>
          {entry.reference && (
            <p className="mt-0.5 text-[12px] text-muted">{entry.reference}</p>
          )}
        </TD>
        <TD className="font-mono text-[12.5px] text-muted-strong">{entry.sku ?? "—"}</TD>
        <TD className="text-[13px] text-muted-strong">{entry.supplierName ?? "—"}</TD>
        <TD numeric align="right">
          {entry.quantity.toLocaleString()}
        </TD>
        <TD numeric align="right" className="text-muted-strong">
          {entry.unitCostFormatted}
        </TD>
        <TD numeric align="right" className="font-medium">
          {entry.baseTotalFormatted}
          {entry.isForeign && (
            <span className="mt-0.5 block text-[11.5px] font-normal text-muted">
              {entry.totalFormatted}
            </span>
          )}
        </TD>
        <TD align="right" className="w-10">
          <RowActions
            label={`Actions for ${entry.productName}`}
            actions={[
              { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
              { label: "Delete", icon: Trash2, tone: "danger", onSelect: () => confirm.ask(entry) },
            ]}
          />
        </TD>
      </TR>

      {editing && (
        <CogsDialog
          entry={entry}
          onClose={() => setEditing(false)}
          products={products}
          suppliers={suppliers}
          baseCurrency={baseCurrency}
        />
      )}

      <ConfirmDialog
        open={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={handleDelete}
        title="Delete this COGS entry?"
        message={`${entry.quantity} × ${entry.productName} (${entry.baseTotalFormatted}) will be removed. Your gross profit will rise by that amount.`}
      />
    </>
  );
}

function CogsDialog({
  entry,
  onClose,
  products,
  suppliers,
  baseCurrency,
}: {
  entry?: CogsRowData;
  onClose: () => void;
  products: ProductOption[];
  suppliers: { id: string; name: string }[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(entry);

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updateCogsAction : createCogsAction,
    null,
  );

  const [productId, setProductId] = useState(entry?.productId ?? "");
  const [productName, setProductName] = useState(entry?.productName ?? "");
  const [sku, setSku] = useState(entry?.sku ?? "");
  const [supplierId, setSupplierId] = useState(entry?.supplierId ?? "");
  const [quantity, setQuantity] = useState(String(entry?.quantity ?? 1));
  const [unitCost, setUnitCost] = useState(entry?.unitCostInput ?? "");
  const [currency, setCurrency] = useState(entry?.currency ?? baseCurrency);

  useEffect(() => {
    if (state?.ok) {
      toast({ title: state.message ?? "Saved" });
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /** Picking a catalogue product fills in its SKU, cost and supplier. */
  function selectProduct(value: string) {
    setProductId(value);
    const product = products.find((item) => item.id === value);
    if (!product) return;
    setProductName(product.name);
    setSku(product.sku ?? "");
    setUnitCost(product.unitCostInput);
    if (product.supplierId) setSupplierId(product.supplierId);
  }

  // Live preview of the figure that will actually be stored.
  const quantityNumber = Number.parseInt(quantity, 10);
  const unitCostNumber = Number.parseFloat(unitCost.replace(/,/g, ""));
  const previewTotal =
    Number.isFinite(quantityNumber) && Number.isFinite(unitCostNumber) && quantityNumber > 0
      ? (quantityNumber * unitCostNumber).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;

  const today = new Date().toISOString().slice(0, 10);
  const isForeign = currency !== baseCurrency;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit COGS entry" : "Record cost of goods"}
      description="What the stock cost you. Total cost is always quantity × unit cost."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="cogs-form" loading={pending}>
            {isEdit ? "Save changes" : "Record COGS"}
          </Button>
        </>
      }
    >
      <form id="cogs-form" action={formAction} className="space-y-4">
        {entry && <input type="hidden" name="id" value={entry.id} />}

        {state?.message && !state.ok && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-negative-border bg-negative-soft p-3"
          >
            <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-negative" aria-hidden />
            <p className="text-[13px] leading-snug text-negative">{state.message}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            name="date"
            type="date"
            label="Date"
            required
            defaultValue={entry?.dateInput ?? today}
            error={state?.errors?.date}
          />
          <Select
            name="supplierId"
            label="Supplier"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            placeholder="Not specified"
            options={suppliers.map((supplier) => ({
              value: supplier.id,
              label: supplier.name,
            }))}
          />
        </div>

        {products.length > 0 && (
          <Select
            name="productId"
            label="Pick from your catalogue"
            hint="Optional. Selecting a product fills in its SKU, cost and supplier."
            value={productId}
            onChange={(event) => selectProduct(event.target.value)}
            placeholder="Not from the catalogue"
            options={products.map((product) => ({
              value: product.id,
              label: product.sku ? `${product.name} (${product.sku})` : product.name,
            }))}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Input
            name="productName"
            label="Product"
            placeholder="LED Trendy Lamp - Black"
            required
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            error={state?.errors?.productName}
          />
          <Input
            name="sku"
            label="SKU"
            placeholder="DK-TL-BLK"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            name="quantity"
            type="number"
            min={1}
            step={1}
            label="Quantity"
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            error={state?.errors?.quantity}
          />
          <Input
            name="unitCost"
            inputMode="decimal"
            label="Unit cost"
            placeholder="0.00"
            required
            value={unitCost}
            onChange={(event) => setUnitCost(event.target.value)}
            error={state?.errors?.unitCost}
          />
          <Select
            name="currency"
            label="Currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
          />
        </div>

        {isForeign && (
          <Input
            name="fxRate"
            label={`Exchange rate to ${baseCurrency}`}
            inputMode="decimal"
            placeholder={`How many ${baseCurrency} is 1 ${currency}?`}
            defaultValue={entry?.isForeign ? entry.fxRateInput : undefined}
            required
            error={state?.errors?.fxRate}
          />
        )}

        <Field label="Total cost">
          <div className="flex h-9.5 items-center rounded-lg border border-border-strong bg-surface-muted px-3">
            <span className="tabular text-sm font-semibold text-foreground">
              {previewTotal ? `${currency} ${previewTotal}` : "—"}
            </span>
            <span className="ml-auto text-[12px] text-muted">quantity × unit cost</span>
          </div>
        </Field>

        <Input
          name="reference"
          label="Purchase order / reference"
          placeholder="PO-1234"
          defaultValue={entry?.reference ?? ""}
        />

        <Textarea name="notes" label="Notes" rows={2} defaultValue={entry?.notes ?? ""} />
      </form>
    </Modal>
  );
}
