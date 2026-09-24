"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, MessageSquarePlus, PackagePlus, Pencil, RefreshCw } from "lucide-react";
import {
  addDeliveryAttemptAction,
  addOrderNoteAction,
  setTrackingNumberAction,
  syncOneOrderAction,
  updateOrderStatusAction,
} from "@/app/actions/orders";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ORDER_STATUSES } from "@/lib/orders/statuses";

const STATUS_OPTIONS = ORDER_STATUSES.map((status) => ({
  value: status.value,
  label: status.label,
}));

const ATTEMPT_OPTIONS = ORDER_STATUSES.filter((status) => status.isAttempt).map((status) => ({
  value: status.value,
  label: status.label,
}));

function Feedback({ state }: { state: FormState }) {
  if (!state || state.ok || !state.message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-negative-border bg-negative-soft p-3"
    >
      <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-negative" aria-hidden />
      <p className="text-[13px] leading-snug text-negative">{state.message}</p>
    </div>
  );
}

export function OrderActionBar({
  orderId,
  currentStatus,
  hasTracking,
  couriers,
}: {
  orderId: string;
  currentStatus: string;
  hasTracking: boolean;
  couriers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"status" | "note" | "tracking" | "attempt" | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setDialog("status")}>
          <Pencil className="h-4 w-4" aria-hidden />
          Change status
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setDialog("note")}>
          <MessageSquarePlus className="h-4 w-4" aria-hidden />
          Add note
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setDialog("tracking")}>
          <PackagePlus className="h-4 w-4" aria-hidden />
          {hasTracking ? "Change CN" : "Add CN number"}
        </Button>
        {hasTracking && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setDialog("attempt")}>
              Record attempt
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await syncOneOrderAction(orderId);
                  toast({
                    title: result.ok ? "Tracking refreshed" : "Could not refresh",
                    description: result.message,
                    variant: result.ok ? "success" : "error",
                  });
                  router.refresh();
                })
              }
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh tracking
            </Button>
          </>
        )}
      </div>

      {dialog === "status" && (
        <StatusDialog
          orderId={orderId}
          currentStatus={currentStatus}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "note" && <NoteDialog orderId={orderId} onClose={() => setDialog(null)} />}
      {dialog === "tracking" && (
        <TrackingDialog orderId={orderId} couriers={couriers} onClose={() => setDialog(null)} />
      )}
      {dialog === "attempt" && <AttemptDialog orderId={orderId} onClose={() => setDialog(null)} />}
    </>
  );
}

function useDialogAction(
  action: (prev: FormState, data: FormData) => Promise<FormState>,
  onClose: () => void,
) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);

  useEffect(() => {
    if (state?.ok) {
      toast({ title: state.message ?? "Saved" });
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return { state, formAction, pending };
}

function StatusDialog({
  orderId,
  currentStatus,
  onClose,
}: {
  orderId: string;
  currentStatus: string;
  onClose: () => void;
}) {
  const { state, formAction, pending } = useDialogAction(updateOrderStatusAction, onClose);

  return (
    <Modal
      open
      onClose={onClose}
      title="Change the order status"
      description="Recorded as a manual event. The courier's own history is left untouched."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="status-form" loading={pending}>
            Update status
          </Button>
        </>
      }
    >
      <form id="status-form" action={formAction} className="space-y-4">
        <input type="hidden" name="orderId" value={orderId} />
        <Feedback state={state} />
        <Select
          name="status"
          label="New status"
          defaultValue={currentStatus}
          options={STATUS_OPTIONS}
          error={state?.errors?.status}
        />
        <Textarea
          name="note"
          label="Why"
          rows={2}
          placeholder="Customer called and asked us to hold it until Friday"
        />
      </form>
    </Modal>
  );
}

function NoteDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { state, formAction, pending } = useDialogAction(addOrderNoteAction, onClose);

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a note"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="note-form" loading={pending}>
            Add note
          </Button>
        </>
      }
    >
      <form id="note-form" action={formAction} className="space-y-4">
        <input type="hidden" name="orderId" value={orderId} />
        <Feedback state={state} />
        <Select
          name="kind"
          label="Kind"
          defaultValue="NOTE"
          hint="Flagging an issue puts this order on the Delivery Issues board; marking it resolved takes it off."
          options={[
            { value: "NOTE", label: "Note" },
            { value: "ISSUE", label: "Flag an issue" },
            { value: "RESOLUTION", label: "Mark resolved" },
          ]}
        />
        <Textarea
          name="body"
          label="Note"
          rows={3}
          required
          placeholder="Spoke to the customer — redelivery agreed for tomorrow morning"
          error={state?.errors?.body}
        />
      </form>
    </Modal>
  );
}

function TrackingDialog({
  orderId,
  couriers,
  onClose,
}: {
  orderId: string;
  couriers: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { state, formAction, pending } = useDialogAction(setTrackingNumberAction, onClose);

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a tracking number"
      description="Use this when the shipment was booked outside this app."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="tracking-form" loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <form id="tracking-form" action={formAction} className="space-y-4">
        <input type="hidden" name="orderId" value={orderId} />
        <Feedback state={state} />
        <Input
          name="trackingNumber"
          label="CN / tracking number"
          placeholder="LE123456789"
          required
          error={state?.errors?.trackingNumber}
        />
        {couriers.length > 0 && (
          <Select
            name="courierId"
            label="Courier"
            defaultValue={couriers[0]?.id}
            options={couriers.map((courier) => ({ value: courier.id, label: courier.name }))}
          />
        )}
      </form>
    </Modal>
  );
}

function AttemptDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { state, formAction, pending } = useDialogAction(addDeliveryAttemptAction, onClose);

  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

  return (
    <Modal
      open
      onClose={onClose}
      title="Record a delivery attempt"
      description="For something the courier has not reported — a call from the rider, for instance."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="attempt-form" loading={pending}>
            Record attempt
          </Button>
        </>
      }
    >
      <form id="attempt-form" action={formAction} className="space-y-4">
        <input type="hidden" name="orderId" value={orderId} />
        <Feedback state={state} />
        <Select
          name="status"
          label="What happened"
          defaultValue="CUSTOMER_NOT_HOME"
          options={ATTEMPT_OPTIONS}
          error={state?.errors?.status}
        />
        <Input
          name="occurredAt"
          type="datetime-local"
          label="When"
          defaultValue={localNow}
          error={state?.errors?.occurredAt}
        />
        <Input name="location" label="Location" placeholder="Lahore" />
        <Textarea name="reason" label="Rider's remarks" rows={2} />
      </form>
    </Modal>
  );
}
