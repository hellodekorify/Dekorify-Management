import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { ForceChangePasswordForm } from "./force-change-form";

export const metadata: Metadata = { title: "Change your password" };

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Only the forced flow lives here; everyone else manages passwords in Settings.
  if (!user.mustChangePassword) redirect("/");

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <KeyRound className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            Set a new password
          </h1>
          <p className="text-[13px] text-muted">Required before you can continue.</p>
        </div>
      </div>

      <p className="mb-6 text-[13.5px] leading-relaxed text-muted">
        Your account was created with a temporary password. Choose your own password to finish
        signing in.
      </p>

      <ForceChangePasswordForm />
    </div>
  );
}
