import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">
        Create your workspace
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        Set up your account and your first store. It takes about a minute.
      </p>

      <div className="mt-7">
        <SignupForm />
      </div>

      <p className="mt-7 text-center text-[13.5px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
