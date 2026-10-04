"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { forceChangePasswordAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function ForceChangePasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    forceChangePasswordAction,
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
        name="currentPassword"
        type="password"
        label="Temporary password"
        autoComplete="current-password"
        required
        error={state?.errors?.currentPassword}
      />

      <Input
        name="newPassword"
        type="password"
        label="New password"
        placeholder="At least 8 characters, with a letter and a number"
        autoComplete="new-password"
        required
        error={state?.errors?.newPassword}
      />

      <Input
        name="confirmPassword"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        error={state?.errors?.confirmPassword}
      />

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Save and continue
      </Button>
    </form>
  );
}
