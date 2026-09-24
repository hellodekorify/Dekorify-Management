import Link from "next/link";
import { ArrowRight, Boxes, Megaphone, Receipt, ShoppingCart, Upload } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";

const STARTING_POINTS = [
  {
    href: "/import",
    icon: Upload,
    title: "Import a spreadsheet",
    body: "Bring in a Shopify export, a bank statement or your expense sheet. Map the columns, check the preview, then import.",
    primary: true,
  },
  {
    href: "/sales",
    icon: ShoppingCart,
    title: "Record a sale",
    body: "Add orders one at a time, with discounts, refunds, shipping income and processing fees.",
  },
  {
    href: "/expenses",
    icon: Receipt,
    title: "Add an expense",
    body: "Rent, salaries, subscriptions and the rest — including recurring ones that post themselves.",
  },
  {
    href: "/cogs",
    icon: Boxes,
    title: "Enter product costs",
    body: "Quantity times unit cost gives you COGS, and COGS is what turns revenue into gross profit.",
  },
  {
    href: "/ads",
    icon: Megaphone,
    title: "Log ad spend",
    body: "Track Meta, Google and TikTok spend to see ROAS and what advertising costs you per rupee earned.",
  },
];

export function EmptyDashboard({ periodLabel }: { periodLabel: string }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="text-center sm:py-10">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-foreground">
            Nothing recorded for {periodLabel.toLowerCase()} yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
            Once there is data in here, this page answers one question at a glance: how much money
            the business actually made. Pick a starting point below, or widen the date range if you
            have already entered data for another period.
          </p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STARTING_POINTS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-xl border border-border-subtle bg-surface p-4 transition-colors hover:border-brand-border hover:bg-brand-soft/30"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <span
              className={
                item.primary
                  ? "flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white"
                  : "flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-muted-strong"
              }
            >
              <item.icon className="h-4.5 w-4.5" aria-hidden />
            </span>
            <p className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
              {item.title}
              <ArrowRight
                className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{item.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
