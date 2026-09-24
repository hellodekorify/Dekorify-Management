"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Banknote,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createSupplierAction,
  deleteSupplierAction,
  recordSupplierPaymentAction,
  updateSupplierAction,
} from "@/app/actions/catalogue";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { RowActions } from "@/components/ui/row-actions";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { PAYMENT_METHODS } from "@/lib/constants";

export interface SupplierCardData {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  openingBalanceInput: string;
  productCount: number;
  productNames: string[];
  totalPurchasesFormatted: string;
  totalPaidFormatted: string;
  outstandingFormatted: string;
  outstandingIsDue: boolean;
  lastPurchase: string | null;
  lastPayment: string | null;
}

export function AddSupplierButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Add supplier
      </Button>
      {open && <SupplierDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function SupplierCard({
  supplier,
  baseCurrency,
}: {
  supplier: SupplierCardData;
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const confirm = useConfirm<SupplierCardData>();

  async function handleDelete() {
    const result = await deleteSupplierAction(supplier.id);
    toast({
      title: result.ok ? "Supplier removed" : "Could not remove",
      description: result.message,
      variant: result.ok ? "success" : "error",
    });
    if (result.ok) router.refresh();
  }

  return (
    <>
      <div
        className="flex flex-col rounded-xl border border-border-subtle bg-surface"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="flex items-start gap-3 border-b border-border-subtle p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {supplier.name}
            </p>
            {supplier.contactName && (
              <p className="mt-0.5 text-[12.5px] text-muted">{supplier.contactName}</p>
            )}
          </div>
          {supplier.outstandingIsDue && <Badge tone="warning">Balance due</Badge>}
          <RowActions
            label={`Actions for ${supplier.name}`}
            actions={[
              { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
              { label: "Record payment", icon: Banknote, onSelect: () => setPaying(true) },
              {
                label: "Remove",
                icon: Trash2,
                tone: "danger",
                onSelect: () => confirm.ask(supplier),
              },
            ]}
          />
        </div>

        <div className="space-y-1.5 border-b border-border-subtle p-4 text-[12.5px] text-muted-strong">
          {supplier.email && (
            <p className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <a href={`mailto:${supplier.email}`} className="truncate hover:text-brand hover:underline">
                {supplier.email}
              </a>
            </p>
          )}
          {supplier.phone && (
            <p className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <a href={`tel:${supplier.phone}`} className="hover:text-brand hover:underline">
                {supplier.phone}
              </a>
            </p>
          )}
          {(supplier.city || supplier.country) && (
            <p className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              {[supplier.city, supplier.country].filter(Boolean).join(", ")}
            </p>
          )}
          {supplier.productCount > 0 && (
            <p className="flex items-start gap-2">
              <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                {supplier.productCount} product{supplier.productCount === 1 ? "" : "s"}
                <span className="block truncate text-[12px] text-muted">
                  {supplier.productNames.join(", ")}
                </span>
              </span>
            </p>
          )}
          {!supplier.email && !supplier.phone && !supplier.city && supplier.productCount === 0 && (
            <p className="text-muted">No contact details recorded.</p>
          )}
        </div>

        <dl className="grid grid-cols-3 divide-x divide-border-subtle">
          <Stat label="Purchased" value={supplier.totalPurchasesFormatted} />
          <Stat label="Paid" value={supplier.totalPaidFormatted} />
          <Stat
            label="Outstanding"
            value={supplier.outstandingFormatted}
            tone={supplier.outstandingIsDue ? "negative" : undefined}
          />
        </dl>
      </div>

      {editing && <SupplierDialog supplier={supplier} onClose={() => setEditing(false)} />}
      {paying && (
        <PaymentDialog
          supplier={supplier}
          baseCurrency={baseCurrency}
          onClose={() => setPaying(false)}
        />
      )}

      <ConfirmDialog
        open={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={handleDelete}
        title="Remove this supplier?"
        message={`"${supplier.name}" will be removed from your list. Purchases and payments already recorded stay in your reports.`}
        confirmLabel="Remove"
      />
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "negative";
}) {
  return (
    <div className="px-3 py-3 text-center">
      <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd
        className={
          tone === "negative"
            ? "tabular mt-0.5 text-[13.5px] font-semibold text-negative"
            : "tabular mt-0.5 text-[13.5px] font-semibold text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function SupplierDialog({
  supplier,
  onClose,
}: {
  supplier?: SupplierCardData;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(supplier);

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updateSupplierAction : createSupplierAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast({ title: state.message ?? "Saved" });
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit supplier" : "Add a supplier"}
      description="Keeping suppliers here lets purchases, payments and outstanding balances roll up per vendor."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="supplier-form" loading={pending}>
            {isEdit ? "Save changes" : "Add supplier"}
          </Button>
        </>
      }
    >
      <form id="supplier-form" action={formAction} className="space-y-4">
        {supplier && <input type="hidden" name="id" value={supplier.id} />}

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
            name="name"
            label="Supplier name"
            placeholder="Al-Noor Handicrafts"
            required
            defaultValue={supplier?.name}
            error={state?.errors?.name}
          />
          <Input
            name="contactName"
            label="Contact person"
            placeholder="Imran Sheikh"
            defaultValue={supplier?.contactName ?? ""}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            name="email"
            type="email"
            label="Email"
            placeholder="orders@supplier.pk"
            defaultValue={supplier?.email ?? ""}
            error={state?.errors?.email}
          />
          <Input
            name="phone"
            label="Phone"
            placeholder="+92 300 1234567"
            defaultValue={supplier?.phone ?? ""}
          />
        </div>

        <Input
          name="address"
          label="Address"
          placeholder="Street and area"
          defaultValue={supplier?.address ?? ""}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input name="city" label="City" defaultValue={supplier?.city ?? ""} />
          <Input name="country" label="Country" defaultValue={supplier?.country ?? ""} />
          <Input
            name="openingBalance"
            inputMode="decimal"
            label="Opening balance owed"
            hint="What you already owed when you started."
            defaultValue={supplier?.openingBalanceInput ?? "0.00"}
          />
        </div>

        <Textarea name="notes" label="Notes" rows={2} defaultValue={supplier?.notes ?? ""} />
      </form>
    </Modal>
  );
}

function PaymentDialog({
  supplier,
  baseCurrency,
  onClose,
}: {
  supplier: SupplierCardData;
  baseCurrency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    recordSupplierPaymentAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast({ title: state.message ?? "Payment recorded" });
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record a payment to ${supplier.name}`}
      description={`Currently outstanding: ${supplier.outstandingFormatted}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" loading={pending}>
            Record payment
          </Button>
        </>
      }
    >
      <form id="payment-form" action={formAction} className="space-y-4">
        <input type="hidden" name="supplierId" value={supplier.id} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            name="date"
            type="date"
            label="Date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            error={state?.errors?.date}
          />
          <Input
            name="amount"
            inputMode="decimal"
            label={`Amount (${baseCurrency})`}
            placeholder="0.00"
            required
            error={state?.errors?.amount}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            name="method"
            label="Paid by"
            placeholder="Not specified"
            options={PAYMENT_METHODS.map((method) => ({
              value: method.value,
              label: method.label,
            }))}
          />
          <Input name="reference" label="Reference" placeholder="Cheque or transaction no." />
        </div>

        <Textarea name="notes" label="Notes" rows={2} />
      </form>
    </Modal>
  );
}
