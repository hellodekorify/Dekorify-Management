import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { can, type AuthzUser } from "@/lib/rbac";
import { AppShell } from "@/components/layout/app-shell";

/** The main-nav hrefs this user may see, by permission (cosmetic gating). */
function allowedNavHrefs(authz: AuthzUser): string[] {
  const hrefs: string[] = [];
  const add = (...h: string[]) => hrefs.push(...h);
  if (can(authz, "Dashboard", "View")) add("/");
  if (can(authz, "Orders", "View")) add("/orders", "/tracking", "/orders/issues");
  if (can(authz, "Finance", "View")) add("/sales", "/expenses", "/cogs", "/ads");
  if (can(authz, "Products", "View")) add("/products", "/suppliers");
  if (can(authz, "Finance", "View")) add("/profit-loss", "/cash-flow");
  if (can(authz, "Reports", "View")) add("/reports");
  if (can(authz, "Finance", "Create")) add("/import");
  // Settings is always reachable (every user can manage their own account).
  add("/settings");
  return hrefs;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, store } = await requireContext();

  const memberships = await prisma.storeMember.findMany({
    where: { userId: user.id },
    include: { store: { select: { id: true, name: true, baseCurrency: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      stores={memberships.map((membership) => membership.store)}
      activeStoreId={store.id}
      allowedHrefs={allowedNavHrefs(user.authz)}
    >
      {children}
    </AppShell>
  );
}
