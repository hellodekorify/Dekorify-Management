import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Link not valid</h1>
        <p className="mt-1.5 text-sm text-muted">
          This password reset link is missing its token. Request a new one to continue.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex text-[13.5px] font-medium text-brand hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">
        Set a new password
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        Choose a new password. Signing in elsewhere will be ended.
      </p>

      <div className="mt-7">
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
