"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Radar, ShoppingBag, Truck, UserCircle, History } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings", label: "Business", icon: Building2 },
  { href: "/settings/profile", label: "Your account", icon: UserCircle },
  { href: "/settings/shopify", label: "Shopify", icon: ShoppingBag },
  { href: "/settings/couriers", label: "Couriers", icon: Truck },
  { href: "/settings/tracking", label: "Tracking", icon: Radar },
  { href: "/settings/activity", label: "Activity log", icon: History },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="lg:w-56 lg:shrink-0">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-brand-soft text-brand"
                    : "text-muted-strong hover:bg-surface-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
