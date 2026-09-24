import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Boxes,
  Megaphone,
  Package,
  Truck,
  Wallet,
  FileBarChart,
  FolderOpen,
  Upload,
  Settings,
  PackageSearch,
  AlertTriangle,
  Radar,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operations",
    items: [
      { href: "/orders", label: "Orders", icon: PackageSearch },
      { href: "/tracking", label: "Shipment Tracking", icon: Radar },
      { href: "/orders/issues", label: "Delivery Issues", icon: AlertTriangle },
    ],
  },
  {
    label: "Transactions",
    items: [
      { href: "/sales", label: "Sales", icon: ShoppingCart },
      { href: "/expenses", label: "Expenses", icon: Receipt },
      { href: "/cogs", label: "COGS", icon: Boxes },
      { href: "/ads", label: "Ads Spend", icon: Megaphone },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/products", label: "Products", icon: Package },
      { href: "/suppliers", label: "Suppliers", icon: Truck },
    ],
  },
  {
    label: "Reporting",
    items: [
      { href: "/profit-loss", label: "Profit & Loss", icon: FileBarChart },
      { href: "/cash-flow", label: "Cash Flow", icon: Wallet },
      { href: "/reports", label: "Reports", icon: FolderOpen },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/import", label: "Import Data", icon: Upload },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function matches(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The single nav item to highlight: the longest href that matches.
 *
 * Without the "longest" part, /orders/issues would light up both Orders and
 * Delivery Issues, while /expenses/categories would correctly light up only
 * Expenses. One rule handles both.
 */
export function activeHref(pathname: string): string | null {
  let best: string | null = null;

  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (matches(pathname, item.href) && (best === null || item.href.length > best.length)) {
        best = item.href;
      }
    }
  }

  return best;
}

export function isActivePath(pathname: string, href: string): boolean {
  return activeHref(pathname) === href;
}
