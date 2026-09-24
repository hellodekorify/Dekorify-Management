import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendingUp, PieChart, FileSpreadsheet, Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

const HIGHLIGHTS = [
  {
    icon: TrendingUp,
    title: "Know your profit, not just your sales",
    body: "Revenue, COGS, ad spend and overheads roll up into one net profit figure.",
  },
  {
    icon: FileSpreadsheet,
    title: "Bring your spreadsheets",
    body: "Import Excel or CSV exports with column mapping and validation before anything is saved.",
  },
  {
    icon: PieChart,
    title: "Built for ecommerce",
    body: "Track ROAS, contribution per order and product-level margin, not generic ledgers.",
  },
  {
    icon: Wallet,
    title: "Cash flow you can trust",
    body: "Opening balance, money in, money out, closing balance — calculated, never guessed.",
  },
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-screen">
      {/* Marketing panel — hidden on small screens so the form gets the room. */}
      <aside className="relative hidden w-[46%] max-w-2xl flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex xl:p-14">
        <div
          className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #0ea5e9 0%, transparent 70%)" }}
          aria-hidden
        />

        <Link href="/login" className="relative z-10 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-[15px] font-bold text-white">
            D
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-white">
            Dekorify Finance
          </span>
        </Link>

        <div className="relative z-10 max-w-md">
          <h1 className="text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] text-white xl:text-[38px]">
            Every number your store makes, in one place.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-sidebar-text">
            A complete accounting workspace for your Shopify business — from the first order to the
            month-end profit and loss statement.
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4 text-white" aria-hidden />
                </span>
                <div>
                  <p className="text-[14px] font-medium text-white">{title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-sidebar-text-muted">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-[12.5px] text-sidebar-text-muted">
          Your data stays on your own machine.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <Link href="/login" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-[15px] font-bold text-white">
              D
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Dekorify Finance</span>
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
