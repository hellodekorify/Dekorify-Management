"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission, getCurrentStore } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  cleanPermissionMap,
  grantablePermissions,
  serialisePermissionMap,
  type PermissionMap,
} from "@/lib/rbac";
import { firstErrors } from "@/lib/utils";
import type { FormState } from "./auth";

const roleSchema = z.object({
  name: z.string().trim().min(2, "Give the role a name.").max(60),
  description: z.string().trim().max(300).optional(),
  permissions: z.string().optional(), // JSON matrix from the editor
});

function parseMatrix(json: string | undefined): PermissionMap {
  if (!json) return {};
  try {
    const raw = JSON.parse(json) as Record<string, string[]>;
    return cleanPermissionMap(raw);
  } catch {
    return {};
  }
}

async function auditStoreId(userId: string): Promise<string | null> {
  const store = await getCurrentStore(userId);
  return store?.id ?? null;
}

export async function createRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await assertPermission("Roles & Permissions", "Create");

  const parsed = roleSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    permissions: formData.get("permissions") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const existing = await prisma.role.findUnique({ where: { name: parsed.data.name } });
  if (existing) return { ok: false, errors: { name: "A role with this name already exists." } };

  // An actor can never put permissions into a role that they do not themselves hold.
  const permissions = grantablePermissions(actor.authz, parseMatrix(parsed.data.permissions));

  const role = await prisma.role.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      isSystem: false,
      permissions: serialisePermissionMap(permissions),
    },
  });

  const storeId = await auditStoreId(actor.id);
  if (storeId) {
    await recordAudit({
      storeId,
      userId: actor.id,
      entity: "Role",
      entityId: role.id,
      action: "CREATE",
      summary: `Created role "${role.name}"`,
      after: permissions,
    });
  }

  revalidatePath("/settings/roles");
  return { ok: true, message: `Role "${role.name}" created.` };
}

export async function updateRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await assertPermission("Roles & Permissions", "Edit");

  const id = String(formData.get("id") ?? "");
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return { ok: false, message: "That role no longer exists." };

  const parsed = roleSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    permissions: formData.get("permissions") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  if (parsed.data.name !== role.name) {
    const clash = await prisma.role.findUnique({ where: { name: parsed.data.name } });
    if (clash) return { ok: false, errors: { name: "A role with this name already exists." } };
  }

  const permissions = grantablePermissions(actor.authz, parseMatrix(parsed.data.permissions));

  const before = role.permissions;
  await prisma.role.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      permissions: serialisePermissionMap(permissions),
    },
  });

  const storeId = await auditStoreId(actor.id);
  if (storeId) {
    await recordAudit({
      storeId,
      userId: actor.id,
      entity: "Role",
      entityId: role.id,
      action: "UPDATE",
      summary: `Updated role "${parsed.data.name}"`,
      before,
      after: permissions,
    });
  }

  revalidatePath("/settings/roles");
  return { ok: true, message: "Role updated." };
}

export async function deleteRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await assertPermission("Roles & Permissions", "Delete");

  const id = String(formData.get("id") ?? "");
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) return { ok: false, message: "That role no longer exists." };
  if (role.isSystem) return { ok: false, message: "System roles cannot be deleted." };
  if (role._count.users > 0) {
    return { ok: false, message: "This role is assigned to users. Reassign them before deleting it." };
  }

  await prisma.role.delete({ where: { id } });

  const storeId = await auditStoreId(actor.id);
  if (storeId) {
    await recordAudit({
      storeId,
      userId: actor.id,
      entity: "Role",
      entityId: id,
      action: "DELETE",
      summary: `Deleted role "${role.name}"`,
    });
  }

  revalidatePath("/settings/roles");
  return { ok: true, message: `Role "${role.name}" deleted.` };
}
