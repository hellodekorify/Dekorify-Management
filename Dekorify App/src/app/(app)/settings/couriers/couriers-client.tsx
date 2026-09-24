"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Plug, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  deleteStatusMappingAction,
  restoreDefaultMappingsAction,
  saveCityMappingAction,
  saveCourierSettingsAction,
  saveStatusMappingAction,
  testCourierConnectionAction,
} from "@/app/actions/orders";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { CardBody, CardFooter } from "@/components/ui/card";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ORDER_STATUSES } from "@/lib/orders/statuses";

const STATUS_OPTIONS = ORDER_STATUSES.map((status) => ({
  value: status.value,
  label: status.label,
}));

export interface MappingRow {
  id: string;
  courierStatus: string;
  internalStatus: string;
  isIssue: boolean;
  isAttempt: boolean;
  isTerminal: boolean;
}

function Feedback({ state }: { state: FormState }) {
  if (!state?.message) return null;
  return (
    <div
      role="alert"
      className={
        state.ok
          ? "flex items-start gap-2.5 rounded-lg border border-positive-border bg-positive-soft p-3"
          : "flex items-start gap-2.5 rounded-lg border border-negative-border bg-negative-soft p-3"
      }
    >
      {state.ok ? (
        <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-positive" aria-hidden />
      ) : (
        <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-negative" aria-hidden />
      )}
      <p className={state.ok ? "text-[13px] text-positive" : "text-[13px] text-negative"}>
        {state.message}
      </p>
    </div>
  );
}

export function CourierSettingsForm({
  courier,
  usingEnvCredentials,
}: {
  courier: {
    hasKey: boolean;
    apiEnvironment: string;
    originCityId: string | null;
    returnAddress: string | null;
  };
  usingEnvCredentials: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveCourierSettingsAction,
    null,
  );
  const [testing, startTest] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      toast({ title: state.message ?? "Saved" });
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction}>
      <CardBody className="space-y-4">
        {state && !state.ok && <Feedback state={state} />}

        {usingEnvCredentials && (
          <div className="rounded-lg border border-info-border bg-info-soft p-3">
            <p className="text-[13px] leading-relaxed text-info">
              Credentials are being read from <code className="font-mono text-[12px]">LEOPARDS_API_KEY</code>{" "}
              and <code className="font-mono text-[12px]">LEOPARDS_API_PASSWORD</code> in your
              environment. Those always win over anything entered here.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            name="apiKey"
            type="password"
            label="API key"
            placeholder={courier.hasKey ? "•••••••••• (leave blank to keep)" : "From your Leopards account manager"}
            autoComplete="off"
            error={state?.errors?.apiKey}
          />
          <Input
            name="apiPassword"
            type="password"
            label="API password"
            placeholder={courier.hasKey ? "•••••••••• (leave blank to keep)" : "From your Leopards account manager"}
            autoComplete="off"
            error={state?.errors?.apiPassword}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            name="apiEnvironment"
            label="Environment"
            defaultValue={courier.apiEnvironment}
            hint="Use Production. Leopards' staging host was unreachable when last checked."
            options={[
              { value: "production", label: "Production" },
              { value: "staging", label: "Staging / test" },
            ]}
          />
          <Input
            name="originCityId"
            label="Origin city ID"
            placeholder="789"
            defaultValue={courier.originCityId ?? ""}
            hint="The Leopards numeric ID for the city you ship from. Required before booking."
            error={state?.errors?.originCityId}
          />
        </div>

        <Textarea
          name="returnAddress"
          label="Return address"
          rows={2}
          placeholder="Shop 4, Main Boulevard, Gulberg III, Lahore"
          defaultValue={courier.returnAddress ?? ""}
          hint="Where Leopards sends parcels that cannot be delivered."
        />
      </CardBody>

      <CardFooter>
        <Button
          type="button"
          variant="secondary"
          loading={testing}
          onClick={() =>
            startTest(async () => {
              const result = await testCourierConnectionAction();
              toast({
                title: result.ok ? "Connection works" : "Connection failed",
                description: result.message,
                variant: result.ok ? "success" : "error",
              });
              router.refresh();
            })
          }
        >
          <Plug className="h-4 w-4" aria-hidden />
          Test connection
        </Button>
        <Button type="submit" loading={pending}>
          Save settings
        </Button>
      </CardFooter>
    </form>
  );
}

export function StatusMappingManager({ mappings }: { mappings: MappingRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<MappingRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [restoring, startRestore] = useTransition();
  const confirm = useConfirm<MappingRow>();

  async function handleDelete(mapping: MappingRow) {
    const result = await deleteStatusMappingAction(mapping.id);
    toast({ title: result.message, variant: result.ok ? "success" : "error" });
    if (result.ok) router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3 sm:px-5">
        <p className="text-[12.5px] text-muted">
          {mappings.length} mapping{mappings.length === 1 ? "" : "s"}. An unmapped status is still
          shown on the timeline — it just does not move the order.
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={restoring}
            onClick={() =>
              startRestore(async () => {
                const result = await restoreDefaultMappingsAction();
                toast({ title: result.message, variant: "success" });
                router.refresh();
              })
            }
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Restore defaults
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add mapping
          </Button>
        </div>
      </div>

      <div className="max-h-[460px] overflow-y-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 border-b border-border-subtle bg-surface-muted">
            <tr>
              <th className="px-4 py-2.5 text-left text-[12px] font-semibold tracking-wide text-muted-strong uppercase">
                Leopards says
              </th>
              <th className="px-4 py-2.5 text-left text-[12px] font-semibold tracking-wide text-muted-strong uppercase">
                We record
              </th>
              <th className="px-4 py-2.5 text-left text-[12px] font-semibold tracking-wide text-muted-strong uppercase">
                Flags
              </th>
              <th className="w-20 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {mappings.map((mapping) => (
              <tr key={mapping.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-2 font-mono text-[12.5px] text-muted-strong">
                  {mapping.courierStatus}
                </td>
                <td className="px-4 py-2 text-[13px]">
                  {STATUS_OPTIONS.find((option) => option.value === mapping.internalStatus)?.label ??
                    mapping.internalStatus}
                </td>
                <td className="px-4 py-2">
                  <span className="flex flex-wrap gap-1">
                    {mapping.isIssue && <Badge tone="warning">issue</Badge>}
                    {mapping.isAttempt && <Badge tone="info">attempt</Badge>}
                    {mapping.isTerminal && <Badge tone="neutral">final</Badge>}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-0.5">
                    <button
                      type="button"
                      onClick={() => setEditing(mapping)}
                      className="rounded p-1.5 text-[12px] font-medium text-brand hover:bg-surface-muted"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => confirm.ask(mapping)}
                      aria-label={`Delete mapping for ${mapping.courierStatus}`}
                      className="rounded p-1.5 text-muted hover:bg-negative-soft hover:text-negative"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(adding || editing) && (
        <MappingDialog
          mapping={editing ?? undefined}
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
        title="Delete this mapping?"
        message={`"${confirm.target?.courierStatus}" will no longer be translated. Existing tracking events keep the status they were given.`}
        confirmLabel="Delete"
      />
    </>
  );
}

function MappingDialog({ mapping, onClose }: { mapping?: MappingRow; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveStatusMappingAction,
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
      title={mapping ? "Edit mapping" : "Add a status mapping"}
      description="Match on the courier's exact wording, lower case. Partial matches work too."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="mapping-form" loading={pending}>
            Save mapping
          </Button>
        </>
      }
    >
      <form id="mapping-form" action={formAction} className="space-y-4">
        {mapping && <input type="hidden" name="id" value={mapping.id} />}
        {state && !state.ok && <Feedback state={state} />}

        <Input
          name="courierStatus"
          label="Leopards status text"
          placeholder="customer not available"
          defaultValue={mapping?.courierStatus}
          required
          error={state?.errors?.courierStatus}
        />

        <Select
          name="internalStatus"
          label="Internal status"
          defaultValue={mapping?.internalStatus ?? "IN_TRANSIT"}
          options={STATUS_OPTIONS}
          error={state?.errors?.internalStatus}
        />

        <div className="space-y-2.5 rounded-lg border border-border-subtle bg-surface-muted p-3">
          <Checkbox
            name="isIssue"
            label="Needs attention"
            hint="Puts the order on the Delivery Issues board."
            defaultChecked={mapping?.isIssue}
          />
          <Checkbox
            name="isAttempt"
            label="Counts as a delivery attempt"
            hint="The rider physically tried to hand it over."
            defaultChecked={mapping?.isAttempt}
          />
          <Checkbox
            name="isTerminal"
            label="Ends the shipment"
            hint="Delivered, returned or cancelled — stops it being polled."
            defaultChecked={mapping?.isTerminal}
          />
        </div>
      </form>
    </Modal>
  );
}

export function CityMappingManager({
  cities,
  unmapped,
}: {
  cities: { id: string; name: string; cityId: string }[];
  unmapped: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveCityMappingAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast({ title: state.message ?? "Saved" });
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <CardBody className="space-y-4">
      {state && <Feedback state={state} />}

      {unmapped.length > 0 && (
        <div className="rounded-lg border border-warning-border bg-warning-soft p-3">
          <p className="text-[13px] font-medium text-warning">
            {unmapped.length} city{unmapped.length === 1 ? "" : "s"} on your orders have no Leopards
            ID yet
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-warning">
            Booking will be refused for these until they are mapped: {unmapped.slice(0, 8).join(", ")}
            {unmapped.length > 8 && ` and ${unmapped.length - 8} more`}.
          </p>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          name="cityName"
          label="City on the order"
          placeholder="Lahore"
          list="unmapped-cities"
          required
          wrapperClassName="flex-1"
          error={state?.errors?.cityName}
        />
        <datalist id="unmapped-cities">
          {unmapped.map((city) => (
            <option key={city} value={city} />
          ))}
        </datalist>
        <Input
          name="cityId"
          label="Leopards city ID"
          placeholder="789"
          required
          wrapperClassName="sm:w-44"
          error={state?.errors?.cityId}
        />
        <Button type="submit" loading={pending} className="sm:mb-0">
          Map city
        </Button>
      </form>

      {cities.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-border-subtle bg-surface-muted">
              <tr>
                <th className="px-3 py-2 text-left text-[12px] font-semibold tracking-wide text-muted-strong uppercase">
                  City
                </th>
                <th className="px-3 py-2 text-left text-[12px] font-semibold tracking-wide text-muted-strong uppercase">
                  Leopards ID
                </th>
              </tr>
            </thead>
            <tbody>
              {cities.map((city) => (
                <tr key={city.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-3 py-2 text-[13px] capitalize">{city.name}</td>
                  <td className="tabular px-3 py-2 font-mono text-[12.5px] text-muted-strong">
                    {city.cityId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[12.5px] leading-relaxed text-muted">
        City IDs come from Leopards&apos; own list — Test connection above fetches it, and your
        account manager can supply the full sheet. Lahore is 789 and Karachi is 1017 on most
        accounts.
      </p>
    </CardBody>
  );
}
