"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { signupAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/currency";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(signupAction, null);

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
        label="Your name"
        placeholder="Ayesha Khan"
        autoComplete="name"
        required
        error={state?.errors?.name}
      />

      <Input
        name="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        autoComplete="email"
        required
        error={state?.errors?.email}
      />

      <Input
        name="password"
        type="password"
        label="Password"
        placeholder="At least 8 characters"
        autoComplete="new-password"
        required
        hint="Use at least 8 characters, including a number."
        error={state?.errors?.password}
      />

      <div className="border-t border-border-subtle pt-4">
        <Input
          name="storeName"
          label="Business or store name"
          placeholder="Dekorify"
          required
          error={state?.errors?.storeName}
        />
      </div>

      <Select
        name="baseCurrency"
        label="Reporting currency"
        defaultValue="PKR"
        hint="All reports are shown in this currency. You can still record transactions in others."
        error={state?.errors?.baseCurrency}
        options={CURRENCY_CODES.map((code) => ({
          value: code,
          label: `${code} — ${CURRENCIES[code].name}`,
        }))}
      />

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Create account
      </Button>
    </form>
  );
}
