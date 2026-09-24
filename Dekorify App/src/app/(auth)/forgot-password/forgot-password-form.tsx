"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, Info } from "lucide-react";
import { requestPasswordResetAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    requestPasswordResetAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-positive-border bg-positive-soft p-3">
          <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-positive" aria-hidden />
          <p className="text-[13px] leading-snug text-positive">{state.message}</p>
        </div>

        {state.token ? (
          <div className="rounded-lg border border-info-border bg-info-soft p-3.5">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-info" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-info">No email server is configured</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-info">
                  Because this workspace runs on your own machine, the reset link is shown here
                  instead of being emailed.
                </p>
                <Link
                  href={`/reset-password?token=${encodeURIComponent(state.token)}`}
                  className="mt-3 inline-flex text-[13px] font-semibold text-info underline underline-offset-2"
                >
                  Continue to set a new password
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        <Link
          href="/login"
          className="block text-center text-[13.5px] font-medium text-brand hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Input
        name="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        autoComplete="email"
        required
        error={state?.errors?.email}
      />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Create reset link
      </Button>
    </form>
  );
}
