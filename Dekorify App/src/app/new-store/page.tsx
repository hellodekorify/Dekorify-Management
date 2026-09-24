import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NewStoreForm } from "./new-store-form";

export const metadata: Metadata = { title: "Add a store" };

export default async function NewStorePage() {
  const user = await requireUser();

  const existingCount = await prisma.storeMember.count({ where: { userId: user.id } });
  const isFirst = existingCount === 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md">
        {!isFirst && (
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
        )}

        <div
          className="rounded-2xl border border-border-subtle bg-surface p-6 sm:p-7"
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft">
            <Store className="h-5 w-5 text-brand" aria-hidden />
          </span>

          <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            {isFirst ? "Set up your store" : "Add another store"}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
            {isFirst
              ? "Every figure in the app belongs to a store. Create yours to get started."
              : "Each store keeps its own sales, expenses, products and reports. Switch between them from the sidebar."}
          </p>

          <div className="mt-6">
            <NewStoreForm />
          </div>
        </div>
      </div>
    </div>
  );
}
