"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { createStoreAction } from "@/app/actions/store";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/currency";

const TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

export function NewStoreForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createStoreAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
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
        label="Store name"
        placeholder="Dekorify"
        required
        error={state?.errors?.name}
      />

      <Select
        name="baseCurrency"
        label="Reporting currency"
        defaultValue="PKR"
        hint="Every report is shown in this currency. Transactions can still be recorded in others."
        error={state?.errors?.baseCurrency}
        options={CURRENCY_CODES.map((code) => ({
          value: code,
          label: `${code} — ${CURRENCIES[code].name}`,
        }))}
      />

      <Select
        name="timezone"
        label="Timezone"
        defaultValue="Asia/Karachi"
        options={TIMEZONES.map((zone) => ({ value: zone, label: zone.replace("_", " ") }))}
      />

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Create store
      </Button>
    </form>
  );
}
