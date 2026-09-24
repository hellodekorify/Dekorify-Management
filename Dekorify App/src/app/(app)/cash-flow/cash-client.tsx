"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  createCashEntryAction,
  deleteCashAccountAction,
  deleteCashEntryAction,
  saveCashAccountAction,
  updateCashEntryAction,
} from "@/app/actions/cash";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { RowActions } from "@/components/ui/row-actions";
import { MoneyInput } from "@/components/forms/money-input";
import { Badge } from "@/components/ui/badge";
import { TD, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { CASH_ACCOUNT_TYPES, CASH_ENTRY_CATEGORIES } from "@/lib/constants";
import { CURRENCY_CODES } from "@/lib/currency";

export interface CashEntryRowData {
  id: string;
  date: string;
  dateInput: string;
  direction: string;
  category: string;
  categoryLabel: string;
  name: string;
  amountInput: string;
  currency: string;
  fxRateInput: string;
  isForeign: boolean;
  amountFormatted: string;
  baseAmountFormatted: string;
  accountId: string | null;
  accountName: string | null;
  notes: string | null;
}

export interface CashAccountData {
  id: string;
  name: string;
  type: string;
  currency: string;
  openingBalanceInput: string;
  openingBalanceFormatted: string;
  openingDateInput: string;
  openingDate: string;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function CashAccountsPanel({
  accounts,
  baseCurrency,
  totalOpeningFormatted,
}: {
  accounts: CashAccountData[];
  baseCurrency: string;
  totalOpeningFormatted: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CashAccountData | null>(null);
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm<CashAccountData>();

  async function handleDelete(account: CashAccountData) {
    const result = await deleteCashAccountAction(account.id);
    toast({
      title: result.ok ? "Account removed" : "Cannot remove",
      description: result.ok ? undefined : result.message,
      variant: result.ok ? "success" : "error",
    });
    if (result.ok) router.refresh();
  }

  return (
    <>
      <ul className="divide-y divide-border-subtle">
        {accounts.map((account) => (
          <li key={account.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
              {account.type === "BANK" ? (
                <Landmark className="h-4 w-4 text-muted-strong" aria-hidden />
              ) : (
                <Wallet className="h-4 w-4 text-muted-strong" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-foreground">{account.name}</p>
              <p className="mt-0.5 text-[12px] text-muted">
                Opening balance from {account.openingDate}
              </p>
            </div>
            <p className="tabular shrink-0 text-[14px] font-semibold">
              {account.openingBalanceFormatted}
            </p>
            <RowActions
              label={`Actions for ${account.name}`}
              actions={[
                { label: "Edit", icon: Pencil, onSelect: () => setEditing(account) },
                {
                  label: "Remove",
                  icon: Trash2,
                  tone: "danger",
                  onSelect: () => confirm.ask(account),
                },
              ]}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-border-subtle bg-surface-muted px-4 py-3 sm:px-5">
        <div>
          <p className="text-[12.5px] text-muted">Total opening balance</p>
          <p className="tabular text-[15px] font-semibold">{totalOpeningFormatted}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add account
        </Button>
      </div>

      {(adding || editing) && (
        <AccountDialog
          account={editing ?? undefined}
          baseCurrency={baseCurrency}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={async () => {
          if (confirm.target) await handleDelete(confirm.target);
        }}
        title="Remove this account?"
        message={`"${confirm.target?.name}" and its opening balance will no longer be counted in your cash position.`}
        confirmLabel="Remove"
      />
    </>
  );
}

function AccountDialog({
  account,
  baseCurrency,
  onClose,
}: {
  account?: CashAccountData;
  baseCurrency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveCashAccountAction,
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
      title={account ? "Edit account" : "Add a cash account"}
      description="The opening balance is where your cash position starts from. Every movement after that date is added on top."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="account-form" loading={pending}>
            {account ? "Save changes" : "Add account"}
          </Button>
        </>
      }
    >
      <form id="account-form" action={formAction} className="space-y-4">
        {account && <input type="hidden" name="id" value={account.id} />}

        <Input
          name="name"
          label="Account name"
          placeholder="Meezan Bank — Current"
          required
          defaultValue={account?.name}
          error={state?.errors?.name}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            name="type"
            label="Type"
            defaultValue={account?.type ?? "BANK"}
            options={CASH_ACCOUNT_TYPES.map((type) => ({ value: type.value, label: type.label }))}
          />
          <Select
            name="currency"
            label="Currency"
            defaultValue={account?.currency ?? baseCurrency}
            options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            name="openingBalance"
            inputMode="decimal"
            label="Opening balance"
            placeholder="0.00"
            defaultValue={account?.openingBalanceInput ?? "0.00"}
            error={state?.errors?.openingBalance}
          />
          <Input
            name="openingDate"
            type="date"
            label="Balance as at"
            required
            defaultValue={account?.openingDateInput ?? new Date().toISOString().slice(0, 10)}
            error={state?.errors?.openingDate}
          />
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Manual movements
// ---------------------------------------------------------------------------

export function AddCashEntryButton({
  accounts,
  baseCurrency,
}: {
  accounts: CashAccountData[];
  baseCurrency: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Record movement
      </Button>
      {open && (
        <EntryDialog
          onClose={() => setOpen(false)}
          accounts={accounts}
          baseCurrency={baseCurrency}
        />
      )}
    </>
  );
}

export function CashEntryRow({
  entry,
  accounts,
  baseCurrency,
}: {
  entry: CashEntryRowData;
  accounts: CashAccountData[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm<CashEntryRowData>();

  async function handleDelete() {
    const result = await deleteCashEntryAction(entry.id);
    toast({
      title: result.ok ? "Movement deleted" : "Could not delete",
      description: result.ok ? undefined : result.message,
      variant: result.ok ? "success" : "error",
    });
    if (result.ok) router.refresh();
  }

  const isIn = entry.direction === "IN";

  return (
    <>
      <TR>
        <TD numeric className="text-muted-strong">
          {entry.date}
        </TD>
        <TD>
          <span className="font-medium">{entry.name}</span>
          {entry.notes && <p className="mt-0.5 text-[12px] text-muted">{entry.notes}</p>}
        </TD>
        <TD>
          <Badge tone="neutral">{entry.categoryLabel}</Badge>
        </TD>
        <TD className="text-[13px] text-muted-strong">{entry.accountName ?? "—"}</TD>
        <TD>
          <span
            className={
              isIn
                ? "inline-flex items-center gap-1 text-[13px] font-medium text-positive"
                : "inline-flex items-center gap-1 text-[13px] font-medium text-negative"
            }
          >
            {isIn ? (
              <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            )}
            {isIn ? "In" : "Out"}
          </span>
        </TD>
        <TD numeric align="right" className={isIn ? "font-medium text-positive" : "font-medium"}>
          {entry.baseAmountFormatted}
          {entry.isForeign && (
            <span className="mt-0.5 block text-[11.5px] font-normal text-muted">
              {entry.amountFormatted}
            </span>
          )}
        </TD>
        <TD align="right" className="w-10">
          <RowActions
            label={`Actions for ${entry.name}`}
            actions={[
              { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
              { label: "Delete", icon: Trash2, tone: "danger", onSelect: () => confirm.ask(entry) },
            ]}
          />
        </TD>
      </TR>

      {editing && (
        <EntryDialog
          entry={entry}
          onClose={() => setEditing(false)}
          accounts={accounts}
          baseCurrency={baseCurrency}
        />
      )}

      <ConfirmDialog
        open={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={handleDelete}
        title="Delete this cash movement?"
        message={`"${entry.name}" (${entry.baseAmountFormatted}) will be removed from your cash flow.`}
      />
    </>
  );
}

function EntryDialog({
  entry,
  onClose,
  accounts,
  baseCurrency,
}: {
  entry?: CashEntryRowData;
  onClose: () => void;
  accounts: CashAccountData[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(entry);

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updateCashEntryAction : createCashEntryAction,
    null,
  );
  const [direction, setDirection] = useState(entry?.direction ?? "IN");

  useEffect(() => {
    if (state?.ok) {
      toast({ title: state.message ?? "Saved" });
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const categories = CASH_ENTRY_CATEGORIES.filter(
    (category) => category.direction === direction,
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit cash movement" : "Record a cash movement"}
      description="For money in or out that is not already a sale, expense, purchase or ad spend — capital, drawings, loans and other income."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="cash-form" loading={pending}>
            {isEdit ? "Save changes" : "Record movement"}
          </Button>
        </>
      }
    >
      <form id="cash-form" action={formAction} className="space-y-4">
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

        <div className="grid grid-cols-2 gap-2">
          {(["IN", "OUT"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDirection(value)}
              aria-pressed={direction === value}
              className={
                direction === value
                  ? value === "IN"
                    ? "flex items-center justify-center gap-2 rounded-lg border border-positive-border bg-positive-soft px-3 py-2.5 text-[13.5px] font-semibold text-positive"
                    : "flex items-center justify-center gap-2 rounded-lg border border-negative-border bg-negative-soft px-3 py-2.5 text-[13.5px] font-semibold text-negative"
                  : "flex items-center justify-center gap-2 rounded-lg border border-border-strong px-3 py-2.5 text-[13.5px] font-medium text-muted-strong transition-colors hover:bg-surface-muted"
              }
            >
              {value === "IN" ? (
                <ArrowDownLeft className="h-4 w-4" aria-hidden />
              ) : (
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              )}
              Money {value === "IN" ? "in" : "out"}
            </button>
          ))}
        </div>
        <input type="hidden" name="direction" value={direction} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            name="date"
            type="date"
            label="Date"
            required
            defaultValue={entry?.dateInput ?? new Date().toISOString().slice(0, 10)}
            error={state?.errors?.date}
          />
          <Select
            name="category"
            label="Type"
            defaultValue={entry?.category ?? categories[0]?.value}
            options={categories.map((category) => ({
              value: category.value,
              label: category.label,
            }))}
          />
        </div>

        <Input
          name="name"
          label="Description"
          placeholder="Capital introduced"
          required
          defaultValue={entry?.name}
          error={state?.errors?.name}
        />

        <MoneyInput
          baseCurrency={baseCurrency}
          defaultAmount={entry?.amountInput}
          defaultCurrency={entry?.currency}
          defaultFxRate={entry?.isForeign ? entry.fxRateInput : undefined}
          error={state?.errors?.amount}
          fxError={state?.errors?.fxRate}
        />

        {accounts.length > 0 && (
          <Select
            name="accountId"
            label="Account"
            defaultValue={entry?.accountId ?? ""}
            placeholder="Not specified"
            options={accounts.map((account) => ({ value: account.id, label: account.name }))}
          />
        )}

        <Textarea name="notes" label="Notes" rows={2} defaultValue={entry?.notes ?? ""} />
      </form>
    </Modal>
  );
}
