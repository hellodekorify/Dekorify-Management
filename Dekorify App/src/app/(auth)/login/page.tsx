import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const params = await searchParams;

  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted">Sign in to your finance workspace.</p>

      {params.reset === "1" && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-positive-border bg-positive-soft p-3">
          <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-positive" aria-hidden />
          <p className="text-[13px] leading-snug text-positive">
            Your password has been changed. Sign in with your new password.
          </p>
        </div>
      )}

      <div className="mt-7">
        <LoginForm />
      </div>

      <p className="mt-7 text-center text-[13.5px] text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-brand hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
