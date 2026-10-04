"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { completeSuperAdminSetupAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function SetupForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    completeSuperAdminSetupAction,
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

      {email && (
        <Input name="email" type="email" label="Email" value={email} readOnly disabled />
      )}

      <Input
        name="name"
        type="text"
        label="Your name"
        placeholder="Full name"
        autoComplete="name"
        required
        error={state?.errors?.name}
      />

      <Input
        name="password"
        type="password"
        label="Password"
        placeholder="At least 8 characters, with a letter and a number"
        autoComplete="new-password"
        required
        error={state?.errors?.password}
      />

      <Input
        name="confirmPassword"
        type="password"
        label="Confirm password"
        placeholder="••••••••"
        autoComplete="new-password"
        required
        error={state?.errors?.confirmPassword}
      />

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Create Super Admin & continue
      </Button>
    </form>
  );
}
