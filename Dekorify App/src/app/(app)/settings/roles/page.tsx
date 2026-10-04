import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { parsePermissionMap } from "@/lib/rbac";
import { RolesClient } from "./roles-client";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  await requirePermission("Roles & Permissions", "View");

  const roles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });

  const data = roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    userCount: r._count.users,
    permissions: parsePermissionMap(r.permissions),
  }));

  return <RolesClient roles={data} />;
}
