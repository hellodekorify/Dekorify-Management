"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createAdSpendAction,
  deleteAdSpendAction,
  updateAdSpendAction,
} from "@/app/actions/ads";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { RowActions } from "@/components/ui/row-actions";
import { MoneyInput } from "@/components/forms/money-input";
import { Swatch } from "@/components/ui/badge";
import { TD, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { AD_PLATFORMS } from "@/lib/constants";

export interface AdRowData {
  id: string;
  date: string;
  dateInput: string;
  platform: string;
  platformLabel: string;
  platformColor: string;
  campaignName: string | null;
  campaignId: string | null;
  amountInput: string;
  amountFormatted: string;
  currency: string;
  fxRateInput: string;
  isForeign: boolean;
  baseAmountFormatted: string;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  notes: string | null;
}

export function AddAdSpendButton({ baseCurrency }: { baseCurrency: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Record ad spend
      </Button>
      {open && <AdDialog onClose={() => setOpen(false)} baseCurrency={baseCurrency} />}
    </>
  );
}

export function AdRow({ entry, baseCurrency }: { entry: AdRowData; baseCurrency: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm<AdRowData>();

  async function handleDelete() {
    const result = await deleteAdSpendAction(entry.id);
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
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
            <Swatch color={entry.platformColor} />
            {entry.platformLabel}
          </span>
        </TD>
        <TD>
          <span className="font-medium">{entry.campaignName ?? "—"}</span>
          {entry.campaignId && (
            <p className="mt-0.5 font-mono text-[11.5px] text-muted">{entry.campaignId}</p>
          )}
        </TD>
        <TD numeric align="right" className="text-muted-strong">
          {entry.impressions?.toLocaleString() ?? "—"}
        </TD>
        <TD numeric align="right" className="text-muted-strong">
          {entry.clicks?.toLocaleString() ?? "—"}
        </TD>
        <TD numeric align="right" className="text-muted-strong">
          {entry.conversions?.toLocaleString() ?? "—"}
        </TD>
        <TD numeric align="right" className="font-medium">
          {entry.baseAmountFormatted}
          {entry.isForeign && (
            <span className="mt-0.5 block text-[11.5px] font-normal text-muted">
              {entry.amountFormatted}
            </span>
          )}
        </TD>
        <TD align="right" className="w-10">
          <RowActions
            label={`Actions for ${entry.campaignName ?? entry.platformLabel}`}
            actions={[
              { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
              { label: "Delete", icon: Trash2, tone: "danger", onSelect: () => confirm.ask(entry) },
            ]}
          />
        </TD>
      </TR>

      {editing && (
        <AdDialog entry={entry} onClose={() => setEditing(false)} baseCurrency={baseCurrency} />
      )}

      <ConfirmDialog
        open={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={handleDelete}
        title="Delete this ad spend entry?"
        message={`${entry.baseAmountFormatted} of ${entry.platformLabel} spend will be removed. Your ROAS and net profit will change.`}
      />
    </>
  );
}

function AdDialog({
  entry,
  onClose,
  baseCurrency,
}: {
  entry?: AdRowData;
  onClose: () => void;
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(entry);

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updateAdSpendAction : createAdSpendAction,
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
      title={isEdit ? "Edit ad spend" : "Record ad spend"}
      description="Advertising is usually the largest controllable cost in ecommerce. Recording it is what makes ROAS meaningful."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="ad-form" loading={pending}>
            {isEdit ? "Save changes" : "Record spend"}
          </Button>
        </>
      }
    >
      <form id="ad-form" action={formAction} className="space-y-4">
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
            name="platform"
            label="Platform"
            required
            defaultValue={entry?.platform ?? "META"}
            error={state?.errors?.platform}
            options={AD_PLATFORMS.map((platform) => ({
              value: platform.value,
              label: platform.label,
            }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Input
            name="campaignName"
            label="Campaign name"
            placeholder="Prospecting - Broad"
            defaultValue={entry?.campaignName ?? ""}
          />
          <Input
            name="campaignId"
            label="Campaign ID"
            placeholder="Optional"
            defaultValue={entry?.campaignId ?? ""}
          />
        </div>

        <MoneyInput
          label="Amount spent"
          baseCurrency={baseCurrency}
          defaultAmount={entry?.amountInput}
          defaultCurrency={entry?.currency}
          defaultFxRate={entry?.isForeign ? entry.fxRateInput : undefined}
          error={state?.errors?.amount}
          fxError={state?.errors?.fxRate}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            name="impressions"
            type="number"
            min={0}
            label="Impressions"
            placeholder="Optional"
            defaultValue={entry?.impressions ?? ""}
          />
          <Input
            name="clicks"
            type="number"
            min={0}
            label="Clicks"
            placeholder="Optional"
            defaultValue={entry?.clicks ?? ""}
          />
          <Input
            name="conversions"
            type="number"
            min={0}
            label="Conversions"
            placeholder="Optional"
            defaultValue={entry?.conversions ?? ""}
          />
        </div>

        <Textarea name="notes" label="Notes" rows={2} defaultValue={entry?.notes ?? ""} />
      </form>
    </Modal>
  );
}
