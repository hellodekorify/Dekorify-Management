import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">
        Reset your password
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        Enter the email address on your account and we&apos;ll create a reset link.
      </p>

      <div className="mt-7">
        <ForgotPasswordForm />
      </div>

      <p className="mt-7 text-center text-[13.5px] text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
