"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, KeyRound, PlugZap, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import {
  saveCredentialsAction,
  saveTrackingSettingsAction,
  testConnectionAction,
  type TrackingActionResult,
} from "@/app/actions/tracking";
import { INTERVAL_CHOICES, type TrackingSettings } from "@/lib/leopards/settings";

function Result({ state }: { state: TrackingActionResult | null }) {
  if (!state) return null;

  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-lg border p-3 text-[13px] ${
        state.ok
          ? "border-positive-border bg-positive-soft text-positive"
          : "border-negative-border bg-negative-soft text-negative"
      }`}
    >
      {state.ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      <div>
        <p>{state.message}</p>
        {state.detail && <p className="mt-0.5 opacity-80">{state.detail}</p>}
      </div>
    </div>
  );
}

export function CredentialsForm({
  hasKey,
  environment,
  originCityId,
  fromEnv,
}: {
  hasKey: boolean;
  environment: string;
  originCityId: string;
  fromEnv: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<TrackingActionResult | null, FormData>(
    saveCredentialsAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (fromEnv) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-muted p-4 text-[13px] text-muted">
        Credentials are supplied by the <code className="font-mono">LEOPARDS_API_KEY</code> and{" "}
        <code className="font-mono">LEOPARDS_API_PASSWORD</code> environment variables, which take
        precedence over anything saved here. Change them in the environment, not in this form.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field
        label="API key"
        htmlFor="apiKey"
        required
        hint={hasKey ? "A key is already saved. Entering one replaces it." : undefined}
      >
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          required
          autoComplete="off"
          placeholder={hasKey ? "••••••••••••••••" : "Supplied by your Leopards account manager"}
        />
      </Field>

      <Field label="API password" htmlFor="apiPassword" required>
        <Input id="apiPassword" name="apiPassword" type="password" required autoComplete="off" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Environment" htmlFor="environment">
          <Select id="environment" name="environment" defaultValue={environment}>
            <option value="production">Production</option>
            <option value="staging">Staging (often unavailable)</option>
          </Select>
        </Field>

        <Field
          label="Origin city id"
          htmlFor="originCityId"
          hint="Only needed for booking, not for tracking."
        >
          <Input id="originCityId" name="originCityId" defaultValue={originCityId} inputMode="numeric" />
        </Field>
      </div>

      <Result state={state} />

      <Button type="submit" loading={pending}>
        <KeyRound className="h-4 w-4" aria-hidden />
        Save credentials
      </Button>
    </form>
  );
}

export function TestConnectionButton() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<TrackingActionResult | null>(null);

  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        loading={pending}
        onClick={() => startTransition(async () => setState(await testConnectionAction()))}
      >
        <PlugZap className="h-4 w-4" aria-hidden />
        Test connection
      </Button>
      <Result state={state} />
    </div>
  );
}

export function SyncSettingsForm({ settings }: { settings: TrackingSettings }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<TrackingActionResult | null, FormData>(
    saveTrackingSettingsAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-4">
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          name="autoSyncEnabled"
          defaultChecked={settings.autoSyncEnabled}
          className="mt-0.5 h-4 w-4 rounded border-border-strong"
        />
        <span className="text-[13.5px]">
          <span className="font-medium text-foreground">Synchronise automatically</span>
          <span className="mt-0.5 block text-[12.5px] text-muted">
            Leopards offers no webhooks, so staying current means asking them on a schedule.
            Refresh now always works regardless of this setting.
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Check active parcels every"
          htmlFor="intervalMinutes"
          hint="Parcels still moving."
        >
          <Select
            id="intervalMinutes"
            name="intervalMinutes"
            defaultValue={String(settings.intervalMinutes)}
          >
            {INTERVAL_CHOICES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes > 60 ? "s" : ""}`}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Re-check finished parcels every"
          htmlFor="terminalRecheckHours"
          hint="Delivered, returned or cancelled."
        >
          <Select
            id="terminalRecheckHours"
            name="terminalRecheckHours"
            defaultValue={String(settings.terminalRecheckHours)}
          >
            <option value="6">6 hours</option>
            <option value="12">12 hours</option>
            <option value="24">24 hours</option>
            <option value="72">3 days</option>
            <option value="168">1 week</option>
          </Select>
        </Field>

        <Field
          label="Parcels per run"
          htmlFor="maxPerRun"
          hint="A ceiling, so a backlog cannot flood Leopards."
        >
          <Input
            id="maxPerRun"
            name="maxPerRun"
            type="number"
            min={20}
            max={2000}
            defaultValue={settings.maxPerRun}
          />
        </Field>
      </div>

      <Result state={state} />

      <Button type="submit" loading={pending}>
        <Save className="h-4 w-4" aria-hidden />
        Save settings
      </Button>
    </form>
  );
}
