"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { resetPasswordAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    resetPasswordAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state?.message && !state.ok && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-negative-border bg-negative-soft p-3"
        >
          <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-negative" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] leading-snug text-negative">{state.message}</p>
            <Link
              href="/forgot-password"
              className="mt-1.5 inline-flex text-[13px] font-semibold text-negative underline underline-offset-2"
            >
              Request a new link
            </Link>
          </div>
        </div>
      )}

      <Input
        name="password"
        type="password"
        label="New password"
        placeholder="At least 8 characters"
        autoComplete="new-password"
        required
        hint="Use at least 8 characters, including a number."
        error={state?.errors?.password}
      />

      <Input
        name="confirmPassword"
        type="password"
        label="Confirm new password"
        placeholder="Type it again"
        autoComplete="new-password"
        required
        error={state?.errors?.confirmPassword}
      />

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Change password
      </Button>
    </form>
  );
}
