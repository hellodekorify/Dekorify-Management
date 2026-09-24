"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut, ChevronsUpDown, Check, Plus } from "lucide-react";
import { NAV_GROUPS, isActivePath } from "./nav-items";
import { cn, initialsOf } from "@/lib/utils";
import { logoutAction } from "@/app/actions/auth";
import { switchStoreAction } from "@/app/actions/store";

export interface ShellStore {
  id: string;
  name: string;
  baseCurrency: string;
}

export function AppShell({
  user,
  stores,
  activeStoreId,
  children,
}: {
  user: { name: string; email: string };
  stores: ShellStore[];
  activeStoreId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer whenever navigation happens, otherwise it covers the page.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const activeStore = stores.find((store) => store.id === activeStoreId) ?? stores[0];

  return (
    <div className="flex min-h-screen">
      {mobileOpen && (
        <div
          className="animate-fade-in fixed inset-0 z-40 bg-[#101828]/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <nav
        aria-label="Main"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-sidebar transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
              D
            </span>
            <span className="truncate text-[14.5px] font-semibold tracking-tight text-white">
              Dekorify Finance
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="-mr-1 rounded-lg p-1.5 text-sidebar-text-muted hover:bg-sidebar-hover hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="px-3 pb-3">
          <StoreSwitcher stores={stores} active={activeStore} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {NAV_GROUPS.map((group, index) => (
            <div key={group.label ?? `group-${index}`} className={index > 0 ? "mt-5" : ""}>
              {group.label && (
                <p className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wider text-sidebar-text-muted uppercase">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                          active
                            ? "bg-sidebar-active text-white"
                            : "text-sidebar-text hover:bg-sidebar-hover hover:text-white",
                        )}
                      >
                        <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold text-white">
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
              <p className="truncate text-[11.5px] text-sidebar-text-muted">{user.email}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="rounded-lg p-1.5 text-sidebar-text-muted transition-colors hover:bg-sidebar-hover hover:text-white"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border-subtle bg-surface/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="-ml-1 rounded-lg p-1.5 text-muted-strong hover:bg-surface-muted"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <span className="truncate text-sm font-semibold">{activeStore?.name}</span>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function StoreSwitcher({ stores, active }: { stores: ShellStore[]; active: ShellStore }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left transition-colors hover:bg-white/10"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white">{active?.name}</p>
          <p className="text-[11.5px] text-sidebar-text-muted">
            Reporting in {active?.baseCurrency}
          </p>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-text-muted" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          onClick={(event) => event.stopPropagation()}
          className="animate-scale-in absolute top-full left-0 z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-border-subtle bg-surface py-1"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          {stores.map((store) => (
            <form key={store.id} action={switchStoreAction}>
              <input type="hidden" name="storeId" value={store.id} />
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-muted"
              >
                <span className="min-w-0 flex-1 truncate">{store.name}</span>
                {store.id === active?.id && (
                  <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                )}
              </button>
            </form>
          ))}
          <Link
            href="/new-store"
            role="menuitem"
            className="flex items-center gap-2 border-t border-border-subtle px-3 py-2 text-[13px] font-medium text-brand transition-colors hover:bg-surface-muted"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add another store
          </Link>
        </div>
      )}
    </div>
  );
}
