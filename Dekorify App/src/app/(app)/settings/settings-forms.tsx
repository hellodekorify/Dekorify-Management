"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { updateStoreAction } from "@/app/actions/store";
import {
  changePasswordAction,
  updateProfileAction,
  type FormState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { CardBody, CardFooter } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
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

export function StoreSettingsForm({
  store,
}: {
  store: { name: string; baseCurrency: string; timezone: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateStoreAction,
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
    <form action={formAction}>
      <CardBody className="space-y-4">
        <Feedback state={state?.ok ? null : state} />

        <Input
          name="name"
          label="Store name"
          required
          defaultValue={store.name}
          error={state?.errors?.name}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            name="baseCurrency"
            label="Reporting currency"
            defaultValue={store.baseCurrency}
            hint="Changing this does not re-convert figures already recorded."
            error={state?.errors?.baseCurrency}
            options={CURRENCY_CODES.map((code) => ({
              value: code,
              label: `${code} — ${CURRENCIES[code].name}`,
            }))}
          />
          <Select
            name="timezone"
            label="Timezone"
            defaultValue={store.timezone}
            options={TIMEZONES.map((zone) => ({ value: zone, label: zone.replace("_", " ") }))}
          />
        </div>
      </CardBody>
      <CardFooter>
        <p className="text-[12.5px] text-muted">Applies to every report in this store.</p>
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
      </CardFooter>
    </form>
  );
}

export function ProfileForm({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateProfileAction,
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
    <form action={formAction}>
      <CardBody className="space-y-4">
        <Feedback state={state?.ok ? null : state} />
        <Input
          name="name"
          label="Your name"
          required
          defaultValue={user.name}
          error={state?.errors?.name}
        />
        <Input
          name="email"
          type="email"
          label="Email"
          required
          defaultValue={user.email}
          hint="Used to sign in."
          error={state?.errors?.email}
        />
      </CardBody>
      <CardFooter>
        <span />
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
      </CardFooter>
    </form>
  );
}

export function PasswordForm() {
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    changePasswordAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) toast({ title: state.message ?? "Password changed" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} key={state?.ok ? "reset" : "form"}>
      <CardBody className="space-y-4">
        <Feedback state={state?.ok ? null : state} />
        <Input
          name="currentPassword"
          type="password"
          label="Current password"
          autoComplete="current-password"
          required
          error={state?.errors?.currentPassword}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            name="newPassword"
            type="password"
            label="New password"
            autoComplete="new-password"
            required
            hint="At least 8 characters, including a number."
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
        </div>
      </CardBody>
      <CardFooter>
        <p className="text-[12.5px] text-muted">
          Changing your password signs you out everywhere else.
        </p>
        <Button type="submit" loading={pending}>
          Change password
        </Button>
      </CardFooter>
    </form>
  );
}
