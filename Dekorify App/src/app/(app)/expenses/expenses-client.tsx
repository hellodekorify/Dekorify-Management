"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Paperclip, Repeat, AlertCircle } from "lucide-react";
import {
  createExpenseAction,
  deleteExpenseAction,
  updateExpenseAction,
} from "@/app/actions/expenses";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { RowActions } from "@/components/ui/row-actions";
import { MoneyInput } from "@/components/forms/money-input";
import { Swatch } from "@/components/ui/badge";
import { TD, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/constants";

export interface ExpenseRowData {
  id: string;
  date: string;
  dateInput: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  amountFormatted: string;
  amountInput: string;
  currency: string;
  fxRateInput: string;
  baseAmountFormatted: string;
  isForeign: boolean;
  paymentMethod: string | null;
  vendorName: string | null;
  supplierId: string | null;
  description: string | null;
  notes: string | null;
  receiptFileName: string | null;
  isRecurring: boolean;
}

export interface CategoryOption {
  id: string;
  name: string;
  kind: string;
  color: string | null;
}

export function AddExpenseButton({
  categories,
  suppliers,
  baseCurrency,
}: {
  categories: CategoryOption[];
  suppliers: { id: string; name: string }[];
  baseCurrency: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Add expense
      </Button>
      {open && (
        <ExpenseDialog
          onClose={() => setOpen(false)}
          categories={categories}
          suppliers={suppliers}
          baseCurrency={baseCurrency}
        />
      )}
    </>
  );
}

export function ExpenseRow({
  expense,
  categories,
  suppliers,
  baseCurrency,
}: {
  expense: ExpenseRowData;
  categories: CategoryOption[];
  suppliers: { id: string; name: string }[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm<ExpenseRowData>();

  async function handleDelete() {
    const result = await deleteExpenseAction(expense.id);
    toast({
      title: result.ok ? "Expense deleted" : "Could not delete",
      description: result.ok ? undefined : result.message,
      variant: result.ok ? "success" : "error",
    });
    if (result.ok) router.refresh();
  }

  return (
    <>
      <TR>
        <TD numeric className="text-muted-strong">
          {expense.date}
        </TD>
        <TD>
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{expense.name}</span>
            {expense.isRecurring && (
              <Repeat className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Recurring" />
            )}
            {expense.receiptFileName && (
              <a
                href={`/api/receipts/${expense.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open receipt: ${expense.receiptFileName}`}
                className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-brand"
              >
                <Paperclip className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Open receipt for {expense.name}</span>
              </a>
            )}
          </div>
          {expense.description && (
            <p className="mt-0.5 max-w-md truncate text-[12.5px] text-muted">
              {expense.description}
            </p>
          )}
        </TD>
        <TD>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-strong">
            <Swatch color={expense.categoryColor ?? "#94a3b8"} />
            {expense.categoryName}
          </span>
        </TD>
        <TD className="text-[13px] text-muted-strong">{expense.vendorName ?? "—"}</TD>
        <TD className="text-[13px] text-muted-strong">
          {paymentMethodLabel(expense.paymentMethod)}
        </TD>
        <TD numeric align="right" className="font-medium">
          {expense.baseAmountFormatted}
          {expense.isForeign && (
            <span className="mt-0.5 block text-[11.5px] font-normal text-muted">
              {expense.amountFormatted}
            </span>
          )}
        </TD>
        <TD align="right" className="w-10">
          <RowActions
            label={`Actions for ${expense.name}`}
            actions={[
              { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
              {
                label: "Delete",
                icon: Trash2,
                tone: "danger",
                onSelect: () => confirm.ask(expense),
              },
            ]}
          />
        </TD>
      </TR>

      {editing && (
        <ExpenseDialog
          expense={expense}
          onClose={() => setEditing(false)}
          categories={categories}
          suppliers={suppliers}
          baseCurrency={baseCurrency}
        />
      )}

      <ConfirmDialog
        open={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={handleDelete}
        title="Delete this expense?"
        message={`"${expense.name}" for ${expense.baseAmountFormatted} will be removed from your reports.`}
        detail={
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-[12.5px] leading-relaxed text-muted">
            The record is kept in the audit trail rather than erased, so it can be recovered if
            this was a mistake.
          </p>
        }
      />
    </>
  );
}

function ExpenseDialog({
  expense,
  onClose,
  categories,
  suppliers,
  baseCurrency,
}: {
  expense?: ExpenseRowData;
  onClose: () => void;
  categories: CategoryOption[];
  suppliers: { id: string; name: string }[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(expense);

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updateExpenseAction : createExpenseAction,
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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit expense" : "Add an expense"}
      description={
        isEdit
          ? "Changes are recorded in the audit trail."
          : "Record a cost the business has paid or committed to."
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" loading={pending}>
            {isEdit ? "Save changes" : "Add expense"}
          </Button>
        </>
      }
    >
      <form id="expense-form" action={formAction} className="space-y-4">
        {expense && <input type="hidden" name="id" value={expense.id} />}

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
            defaultValue={expense?.dateInput ?? today}
            error={state?.errors?.date}
          />
          <Select
            name="categoryId"
            label="Category"
            defaultValue={expense?.categoryId ?? ""}
            placeholder="Uncategorised"
            error={state?.errors?.categoryId}
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
          />
        </div>

        <Input
          name="name"
          label="Expense name"
          placeholder="Office rent for March"
          required
          defaultValue={expense?.name}
          error={state?.errors?.name}
        />

        <MoneyInput
          baseCurrency={baseCurrency}
          defaultAmount={expense?.amountInput}
          defaultCurrency={expense?.currency}
          defaultFxRate={expense?.isForeign ? expense.fxRateInput : undefined}
          error={state?.errors?.amount}
          fxError={state?.errors?.fxRate}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            name="paymentMethod"
            label="Paid by"
            defaultValue={expense?.paymentMethod ?? ""}
            placeholder="Not specified"
            options={PAYMENT_METHODS.map((method) => ({
              value: method.value,
              label: method.label,
            }))}
          />
          <Input
            name="vendorName"
            label="Vendor"
            placeholder="Who was paid"
            defaultValue={expense?.vendorName ?? ""}
          />
        </div>

        {suppliers.length > 0 && (
          <Select
            name="supplierId"
            label="Link to a supplier"
            hint="Optional. Links this cost to a supplier's purchase history."
            defaultValue={expense?.supplierId ?? ""}
            placeholder="Not linked"
            options={suppliers.map((supplier) => ({
              value: supplier.id,
              label: supplier.name,
            }))}
          />
        )}

        <Textarea
          name="description"
          label="Description"
          placeholder="What this covers"
          rows={2}
          defaultValue={expense?.description ?? ""}
        />

        <Field
          label="Receipt or invoice"
          hint={
            expense?.receiptFileName
              ? `Currently attached: ${expense.receiptFileName}. Choosing a new file replaces it.`
              : "PDF or image, up to 20 MB."
          }
          error={state?.errors?.receipt}
        >
          <input
            type="file"
            name="receipt"
            accept=".pdf,image/png,image/jpeg,image/webp"
            className="block w-full text-[13px] text-muted-strong file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-foreground hover:file:bg-surface-muted"
          />
        </Field>

        <Textarea
          name="notes"
          label="Notes"
          placeholder="Anything worth remembering"
          rows={2}
          defaultValue={expense?.notes ?? ""}
        />
      </form>
    </Modal>
  );
}
