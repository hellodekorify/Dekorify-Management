"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { createSaleAction, deleteSaleAction, updateSaleAction } from "@/app/actions/sales";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { RowActions } from "@/components/ui/row-actions";
import { Badge } from "@/components/ui/badge";
import { TD, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { CURRENCY_CODES } from "@/lib/currency";
import { FINANCIAL_STATUSES, FULFILLMENT_STATUSES, SALES_CHANNELS } from "@/lib/constants";

export interface SaleRowData {
  id: string;
  date: string;
  dateInput: string;
  orderId: string;
  customerName: string | null;
  channel: string;
  productId: string | null;
  productName: string | null;
  sku: string | null;
  quantity: number;
  grossInput: string;
  discountInput: string;
  refundInput: string;
  shippingInput: string;
  paymentFeeInput: string;
  grossFormatted: string;
  discountFormatted: string;
  refundFormatted: string;
  shippingFormatted: string;
  paymentFeeFormatted: string;
  netFormatted: string;
  currency: string;
  fxRateInput: string;
  isForeign: boolean;
  baseNetFormatted: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  fulfillmentLabel: string;
  countsAsRevenue: boolean;
  notes: string | null;
}

export interface SaleProductOption {
  id: string;
  name: string;
  sku: string | null;
  priceInput: string;
}

export function AddSaleButton({
  products,
  baseCurrency,
}: {
  products: SaleProductOption[];
  baseCurrency: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Record sale
      </Button>
      {open && (
        <SaleDialog
          onClose={() => setOpen(false)}
          products={products}
          baseCurrency={baseCurrency}
        />
      )}
    </>
  );
}

function statusTone(status: string | null) {
  switch (status) {
    case "FULFILLED":
      return "positive" as const;
    case "RETURNED":
      return "negative" as const;
    case "CANCELLED":
      return "neutral" as const;
    case "IN_TRANSIT":
      return "info" as const;
    default:
      return "warning" as const;
  }
}

export function SaleRow({
  sale,
  products,
  baseCurrency,
}: {
  sale: SaleRowData;
  products: SaleProductOption[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm<SaleRowData>();

  async function handleDelete() {
    const result = await deleteSaleAction(sale.id);
    toast({
      title: result.ok ? "Sale deleted" : "Could not delete",
      description: result.ok ? undefined : result.message,
      variant: result.ok ? "success" : "error",
    });
    if (result.ok) router.refresh();
  }

  return (
    <>
      <TR muted={!sale.countsAsRevenue}>
        <TD numeric className="text-muted-strong">
          {sale.date}
        </TD>
        <TD>
          <span className="font-medium">{sale.orderId}</span>
          {sale.customerName && (
            <p className="mt-0.5 text-[12px] text-muted">{sale.customerName}</p>
          )}
        </TD>
        <TD>
          <span className="text-[13px]">{sale.productName ?? "—"}</span>
          {sale.quantity > 1 && (
            <span className="ml-1.5 text-[12px] text-muted">× {sale.quantity}</span>
          )}
        </TD>
        <TD className="text-[13px] text-muted-strong">{sale.channel}</TD>
        <TD>
          <Badge tone={statusTone(sale.fulfillmentStatus)}>{sale.fulfillmentLabel}</Badge>
        </TD>
        <TD numeric align="right" className="text-muted-strong">
          {sale.grossFormatted}
        </TD>
        <TD numeric align="right" className="text-muted-strong">
          {sale.discountFormatted}
        </TD>
        <TD numeric align="right" className="font-medium">
          {sale.baseNetFormatted}
          {sale.isForeign && (
            <span className="mt-0.5 block text-[11.5px] font-normal text-muted">
              {sale.netFormatted}
            </span>
          )}
        </TD>
        <TD align="right" className="w-10">
          <RowActions
            label={`Actions for order ${sale.orderId}`}
            actions={[
              { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
              { label: "Delete", icon: Trash2, tone: "danger", onSelect: () => confirm.ask(sale) },
            ]}
          />
        </TD>
      </TR>

      {editing && (
        <SaleDialog
          sale={sale}
          onClose={() => setEditing(false)}
          products={products}
          baseCurrency={baseCurrency}
        />
      )}

      <ConfirmDialog
        open={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={handleDelete}
        title="Delete this sale?"
        message={`Order ${sale.orderId} (${sale.baseNetFormatted}) will be removed from your revenue.`}
      />
    </>
  );
}

function SaleDialog({
  sale,
  onClose,
  products,
  baseCurrency,
}: {
  sale?: SaleRowData;
  onClose: () => void;
  products: SaleProductOption[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(sale);

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updateSaleAction : createSaleAction,
    null,
  );

  const [productId, setProductId] = useState(sale?.productId ?? "");
  const [productName, setProductName] = useState(sale?.productName ?? "");
  const [sku, setSku] = useState(sale?.sku ?? "");
  const [gross, setGross] = useState(sale?.grossInput ?? "");
  const [discount, setDiscount] = useState(sale?.discountInput ?? "");
  const [refund, setRefund] = useState(sale?.refundInput ?? "");
  const [shipping, setShipping] = useState(sale?.shippingInput ?? "");
  const [currency, setCurrency] = useState(sale?.currency ?? baseCurrency);
  const [fulfillment, setFulfillment] = useState(sale?.fulfillmentStatus ?? "FULFILLED");

  useEffect(() => {
    if (state?.ok) {
      toast({ title: state.message ?? "Saved" });
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function selectProduct(value: string) {
    setProductId(value);
    const product = products.find((item) => item.id === value);
    if (!product) return;
    setProductName(product.name);
    setSku(product.sku ?? "");
    if (!gross) setGross(product.priceInput);
  }

  const toNumber = (value: string) => {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const earnsRevenue = fulfillment !== "CANCELLED" && fulfillment !== "RETURNED";
  const previewNet = earnsRevenue
    ? toNumber(gross) - toNumber(discount) - toNumber(refund) + toNumber(shipping)
    : 0;

  const today = new Date().toISOString().slice(0, 10);
  const isForeign = currency !== baseCurrency;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit sale" : "Record a sale"}
      description="Net revenue is worked out from these figures — cancelled and returned orders earn nothing."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="sale-form" loading={pending}>
            {isEdit ? "Save changes" : "Record sale"}
          </Button>
        </>
      }
    >
      <form id="sale-form" action={formAction} className="space-y-4">
        {sale && <input type="hidden" name="id" value={sale.id} />}

        {state?.message && !state.ok && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-negative-border bg-negative-soft p-3"
          >
            <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-negative" aria-hidden />
            <p className="text-[13px] leading-snug text-negative">{state.message}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            name="date"
            type="date"
            label="Order date"
            required
            defaultValue={sale?.dateInput ?? today}
            error={state?.errors?.date}
          />
          <Input
            name="orderId"
            label="Order reference"
            placeholder="#DK-0826-7412"
            required
            defaultValue={sale?.orderId}
            error={state?.errors?.orderId}
          />
          <Select
            name="channel"
            label="Sales channel"
            defaultValue={sale?.channel ?? "Shopify"}
            options={SALES_CHANNELS.map((channel) => ({ value: channel, label: channel }))}
          />
        </div>

        <Input
          name="customerName"
          label="Customer"
          placeholder="Optional"
          defaultValue={sale?.customerName ?? ""}
        />

        {products.length > 0 && (
          <Select
            name="productId"
            label="Pick from your catalogue"
            hint="Optional. Fills in the product name, SKU and selling price."
            value={productId}
            onChange={(event) => selectProduct(event.target.value)}
            placeholder="Not from the catalogue"
            options={products.map((product) => ({
              value: product.id,
              label: product.sku ? `${product.name} (${product.sku})` : product.name,
            }))}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_100px]">
          <Input
            name="productName"
            label="Product"
            placeholder="What was sold"
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
          />
          <Input
            name="sku"
            label="SKU"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
          />
          <Input
            name="quantity"
            type="number"
            min={1}
            label="Qty"
            defaultValue={sale?.quantity ?? 1}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            name="fulfillmentStatus"
            label="Fulfilment status"
            value={fulfillment}
            onChange={(event) => setFulfillment(event.target.value)}
            hint={
              earnsRevenue
                ? undefined
                : "This order will not count towards revenue, which is correct for returns and cancellations."
            }
            options={FULFILLMENT_STATUSES.map((status) => ({
              value: status.value,
              label: status.label,
            }))}
          />
          <Select
            name="financialStatus"
            label="Payment status"
            defaultValue={sale?.financialStatus ?? "PENDING"}
            placeholder="Not specified"
            options={FINANCIAL_STATUSES.map((status) => ({
              value: status.value,
              label: status.label,
            }))}
          />
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-muted p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-foreground">Order value</p>
            <Select
              name="currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="h-8 w-24 text-[13px]"
              aria-label="Currency"
              options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              name="grossAmount"
              inputMode="decimal"
              label="Sales amount"
              placeholder="0.00"
              required
              value={gross}
              onChange={(event) => setGross(event.target.value)}
              error={state?.errors?.grossAmount}
            />
            <Input
              name="discount"
              inputMode="decimal"
              label="Discount"
              placeholder="0.00"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              error={state?.errors?.discount}
            />
            <Input
              name="refund"
              inputMode="decimal"
              label="Refund"
              placeholder="0.00"
              value={refund}
              onChange={(event) => setRefund(event.target.value)}
              error={state?.errors?.refund}
            />
            <Input
              name="shippingRevenue"
              inputMode="decimal"
              label="Shipping charged"
              placeholder="0.00"
              value={shipping}
              onChange={(event) => setShipping(event.target.value)}
              error={state?.errors?.shippingRevenue}
            />
          </div>

          <div className="mt-3">
            <Input
              name="paymentFee"
              inputMode="decimal"
              label="Payment processing fee"
              placeholder="0.00"
              defaultValue={sale?.paymentFeeInput ?? ""}
              hint="Shown as a cost in the profit & loss statement, not deducted from revenue here."
              error={state?.errors?.paymentFee}
            />
          </div>

          <div className="mt-3 flex items-baseline justify-between border-t border-border-strong pt-3">
            <span className="text-[13px] font-semibold text-foreground">Net revenue</span>
            <span className="tabular text-[16px] font-semibold text-foreground">
              {currency}{" "}
              {previewNet.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <p className="mt-1 text-right text-[11.5px] text-muted">
            sales − discount − refund + shipping
          </p>
        </div>

        {isForeign && (
          <Input
            name="fxRate"
            label={`Exchange rate to ${baseCurrency}`}
            inputMode="decimal"
            placeholder={`How many ${baseCurrency} is 1 ${currency}?`}
            defaultValue={sale?.isForeign ? sale.fxRateInput : undefined}
            required
            error={state?.errors?.fxRate}
          />
        )}

        <Textarea name="notes" label="Notes" rows={2} defaultValue={sale?.notes ?? ""} />

        <p className="text-[12.5px] leading-relaxed text-muted">
          Order references must be unique, so importing the same Shopify export twice will not
          double your revenue.
        </p>
      </form>
    </Modal>
  );
}
