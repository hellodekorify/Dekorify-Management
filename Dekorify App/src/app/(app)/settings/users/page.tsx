import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { parsePermissionMap } from "@/lib/rbac";
import { UsersClient } from "./users-client";

export const metadata: Metadata = { title: "User management" };

const PAGE_SIZE = 25;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const actor = await requirePermission("User Management", "View");
  const params = await searchParams;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const search = (params.q ?? "").trim();
  const status = params.status;

  const where: Prisma.UserWhereInput = {
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { employeeId: { contains: search } },
          ],
        }
      : {}),
    ...(status && status !== "all" ? { status } : {}),
  };

  const [users, total, roles, managers] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        role: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    accountType: u.accountType,
    status: u.status,
    department: u.department,
    jobTitle: u.jobTitle,
    phone: u.phone,
    employeeId: u.employeeId,
    notes: u.notes,
    reportingManagerId: u.reportingManagerId,
    expiresAt: u.expiresAt ? u.expiresAt.toISOString().slice(0, 10) : null,
    roleId: u.roleId,
    roleName: u.role?.name ?? null,
    createdByName: u.createdBy?.name ?? null,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    permissionOverrides: u.permissionOverrides,
    isSelf: u.id === actor.id,
  }));

  const roleOptions = roles.map((r) => ({
    id: r.id,
    name: r.name,
    isSystem: r.isSystem,
    permissions: parsePermissionMap(r.permissions),
  }));

  return (
    <UsersClient
      rows={rows}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      search={search}
      status={status ?? "all"}
      roles={roleOptions}
      managers={managers}
      actorType={actor.accountType}
    />
  );
}
