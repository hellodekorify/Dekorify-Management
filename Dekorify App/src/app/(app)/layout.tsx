import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

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
    >
      {children}
    </AppShell>
  );
}
