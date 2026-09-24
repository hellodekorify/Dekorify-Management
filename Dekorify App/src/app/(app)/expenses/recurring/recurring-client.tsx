"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import {
  createRecurringAction,
  deleteRecurringAction,
  postDueRecurringAction,
  toggleRecurringAction,
  updateRecurringAction,
} from "@/app/actions/recurring";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { RowActions } from "@/components/ui/row-actions";
import { MoneyInput } from "@/components/forms/money-input";
import { Badge, Swatch } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { PAYMENT_METHODS, RECURRING_FREQUENCIES } from "@/lib/constants";
import type { CategoryOption } from "../expenses-client";

export interface RecurringRowData {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  amountInput: string;
  currency: string;
  fxRateInput: string;
  isForeign: boolean;
  baseAmountFormatted: string;
  frequency: string;
  frequencyLabel: string;
  startDateInput: string;
  endDateInput: string;
  dayOfMonth: number | null;
  paymentMethod: string | null;
  vendorName: string | null;
  notes: string | null;
  isActive: boolean;
  nextDate: string;
  dueCount: number;
}

export function PostDueBanner({ dueTotal }: { dueTotal: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  if (dueTotal === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning-border bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="text-[14px] font-semibold text-warning">
            {dueTotal} expense{dueTotal === 1 ? "" : "s"} due to be posted
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-warning">
            These schedules have reached their due date but no expense has been created yet.
            Posting them writes real expense records into your reports.
          </p>
        </div>
      </div>
      <Button
        loading={pending}
        className="shrink-0"
        onClick={() =>
          startTransition(async () => {
            const result = await postDueRecurringAction();
            toast({
              title: result.created > 0 ? "Expenses posted" : "Nothing due",
              description: result.message,
              variant: "success",
            });
            router.refresh();
          })
        }
      >
        <Zap className="h-4 w-4" aria-hidden />
        Post now
      </Button>
    </div>
  );
}

export function AddRecurringButton({
  categories,
  baseCurrency,
}: {
  categories: CategoryOption[];
  baseCurrency: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        New schedule
      </Button>
      {open && (
        <RecurringDialog
          onClose={() => setOpen(false)}
          categories={categories}
          baseCurrency={baseCurrency}
        />
      )}
    </>
  );
}

export function RecurringCard({
  schedule,
  categories,
  baseCurrency,
}: {
  schedule: RecurringRowData;
  categories: CategoryOption[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm<RecurringRowData>();
  const [, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await toggleRecurringAction(schedule.id, !schedule.isActive);
      toast({ title: result.message, variant: result.ok ? "success" : "error" });
      router.refresh();
    });
  }

  async function handleDelete() {
    const result = await deleteRecurringAction(schedule.id);
    toast({
      title: result.ok ? "Schedule deleted" : "Could not delete",
      description: result.message,
      variant: result.ok ? "success" : "error",
    });
    if (result.ok) router.refresh();
  }

  return (
    <>
      <div
        className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface p-4"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14.5px] font-semibold text-foreground">{schedule.name}</p>
            {!schedule.isActive && <Badge tone="neutral">Paused</Badge>}
            {schedule.dueCount > 0 && (
              <Badge tone="warning" dot>
                {schedule.dueCount} due
              </Badge>
            )}
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Swatch color={schedule.categoryColor ?? "#94a3b8"} />
              {schedule.categoryName}
            </span>
            <span aria-hidden>·</span>
            <span>{schedule.frequencyLabel}</span>
            <span aria-hidden>·</span>
            <span>Next {schedule.nextDate}</span>
          </p>

          {schedule.vendorName && (
            <p className="mt-1 text-[12.5px] text-muted">Paid to {schedule.vendorName}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <p className="tabular text-[15px] font-semibold text-foreground">
            {schedule.baseAmountFormatted}
          </p>
          <RowActions
            label={`Actions for ${schedule.name}`}
            actions={[
              { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
              {
                label: schedule.isActive ? "Pause schedule" : "Resume schedule",
                icon: schedule.isActive ? Pause : Play,
                onSelect: toggle,
              },
              {
                label: "Delete",
                icon: Trash2,
                tone: "danger",
                onSelect: () => confirm.ask(schedule),
              },
            ]}
          />
        </div>
      </div>

      {editing && (
        <RecurringDialog
          schedule={schedule}
          onClose={() => setEditing(false)}
          categories={categories}
          baseCurrency={baseCurrency}
        />
      )}

      <ConfirmDialog
        open={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={handleDelete}
        title="Delete this schedule?"
        message={`"${schedule.name}" will stop generating expenses. Entries it has already posted stay in your records.`}
      />
    </>
  );
}

function RecurringDialog({
  schedule,
  onClose,
  categories,
  baseCurrency,
}: {
  schedule?: RecurringRowData;
  onClose: () => void;
  categories: CategoryOption[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(schedule);

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updateRecurringAction : createRecurringAction,
    null,
  );
  const [frequency, setFrequency] = useState(schedule?.frequency ?? "MONTHLY");

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
      title={isEdit ? "Edit recurring expense" : "New recurring expense"}
      description="Set it once and post the entries when they fall due."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="recurring-form" loading={pending}>
            {isEdit ? "Save changes" : "Create schedule"}
          </Button>
        </>
      }
    >
      <form id="recurring-form" action={formAction} className="space-y-4">
        {schedule && <input type="hidden" name="id" value={schedule.id} />}

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
          label="Expense name"
          placeholder="Shopify subscription"
          required
          defaultValue={schedule?.name}
          error={state?.errors?.name}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            name="categoryId"
            label="Category"
            defaultValue={schedule?.categoryId ?? ""}
            placeholder="Uncategorised"
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
          />
          <Select
            name="frequency"
            label="Frequency"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value)}
            error={state?.errors?.frequency}
            options={RECURRING_FREQUENCIES.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </div>

        <MoneyInput
          baseCurrency={baseCurrency}
          defaultAmount={schedule?.amountInput}
          defaultCurrency={schedule?.currency}
          defaultFxRate={schedule?.isForeign ? schedule.fxRateInput : undefined}
          error={state?.errors?.amount}
          fxError={state?.errors?.fxRate}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            name="startDate"
            type="date"
            label="Starts on"
            required
            defaultValue={schedule?.startDateInput ?? today}
            error={state?.errors?.startDate}
          />
          <Input
            name="endDate"
            type="date"
            label="Ends on"
            hint="Leave blank to run indefinitely."
            defaultValue={schedule?.endDateInput ?? ""}
            error={state?.errors?.endDate}
          />
          {frequency !== "WEEKLY" && (
            <Input
              name="dayOfMonth"
              type="number"
              min={1}
              max={31}
              label="Day of month"
              hint="Short months fall back to the last day."
              defaultValue={schedule?.dayOfMonth ?? ""}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            name="paymentMethod"
            label="Paid by"
            defaultValue={schedule?.paymentMethod ?? ""}
            placeholder="Not specified"
            options={PAYMENT_METHODS.map((method) => ({
              value: method.value,
              label: method.label,
            }))}
          />
          <Input
            name="vendorName"
            label="Vendor"
            placeholder="Who is paid"
            defaultValue={schedule?.vendorName ?? ""}
          />
        </div>

        <Textarea
          name="notes"
          label="Notes"
          rows={2}
          defaultValue={schedule?.notes ?? ""}
        />
      </form>
    </Modal>
  );
}
