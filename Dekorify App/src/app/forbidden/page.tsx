import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not permitted" };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-negative-soft text-negative">
        <ShieldAlert className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
        You don&apos;t have access to this
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
        Your account doesn&apos;t have permission for this area. If you think you should, ask your
        administrator to grant it.
      </p>
      <LinkButton href="/" variant="primary" size="lg" className="mt-6">
        Back to dashboard
      </LinkButton>
    </div>
  );
}
