import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { needsSuperAdminSetup, superAdminEmail } from "@/lib/auth";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "First-time setup" };

// Depends on live database state, so it must never be statically prerendered.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSuperAdminSetup())) redirect("/login");
  const email = superAdminEmail();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            Set up the Super Admin
          </h1>
          <p className="text-[13px] text-muted">One-time setup for this deployment.</p>
        </div>
      </div>

      <p className="mb-6 text-[13.5px] leading-relaxed text-muted">
        Choose a password for the Super Admin account
        {email ? (
          <>
            {" "}
            <span className="font-medium text-foreground">{email}</span>
          </>
        ) : null}
        . This account controls every other account in the app.
      </p>

      <SetupForm email={email ?? ""} />
    </div>
  );
}
