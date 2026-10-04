"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertPermission,
  getCurrentStore,
  hashPassword,
  validatePasswordStrength,
} from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  canManageTarget,
  cleanPermissionMap,
  diffPermissions,
  grantablePermissions,
  parsePermissionMap,
  type AccountType,
  type PermissionMap,
} from "@/lib/rbac";
import { firstErrors } from "@/lib/utils";
import type { FormState } from "./auth";

/** A readable, reasonably strong temporary password (meets the strength rule). */
function generateTempPassword(): string {
  const base = randomBytes(9).toString("base64url").replace(/[^a-zA-Z0-9]/g, "");
  return `Dk-${base}${Math.floor(Math.random() * 90 + 10)}`;
}

async function auditStoreId(userId: string): Promise<string | null> {
  const store = await getCurrentStore(userId);
  return store?.id ?? null;
}

function parseMatrix(json: string | undefined | null): PermissionMap {
  if (!json) return {};
  try {
    return cleanPermissionMap(JSON.parse(json) as Record<string, string[]>);
  } catch {
    return {};
  }
}

function parseExpiry(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Enter the person's name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  accountType: z.enum(["ADMIN", "DEPARTMENT"]),
  roleId: z.string().optional(),
  department: z.string().trim().max(100).optional(),
  jobTitle: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  employeeId: z.string().trim().max(60).optional(),
  reportingManagerId: z.string().optional(),
  expiresAt: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
  permissions: z.string().optional(),
  tempPassword: z.string().min(1, "Set a temporary password."),
});

/**
 * Creates a sub-account. Enforces that the actor may create this account type,
 * may only grant permissions they themselves hold, and that the new account is
 * gated behind a forced password change. Super Admin accounts are never created
 * here — they come only from the bootstrap.
 */
export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await assertPermission("User Management", "Create");

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    accountType: formData.get("accountType"),
    roleId: formData.get("roleId") || undefined,
    department: formData.get("department") || undefined,
    jobTitle: formData.get("jobTitle") || undefined,
    phone: formData.get("phone") || undefined,
    employeeId: formData.get("employeeId") || undefined,
    reportingManagerId: formData.get("reportingManagerId") || undefined,
    expiresAt: formData.get("expiresAt") || undefined,
    notes: formData.get("notes") || undefined,
    permissions: formData.get("permissions") || undefined,
    tempPassword: formData.get("tempPassword"),
  });
  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }
  const data = parsed.data;

  // Only a Super Admin may create Admin accounts; Admins may create department users only.
  const targetType = data.accountType as AccountType;
  if (targetType === "ADMIN" && actor.accountType !== "SUPER_ADMIN") {
    return { ok: false, message: "Only the Super Admin can create Admin accounts." };
  }
  if (!canManageTarget(actor.authz, { accountType: targetType, id: "new" })) {
    return { ok: false, message: "You cannot create this type of account." };
  }

  const strength = validatePasswordStrength(data.tempPassword);
  if (strength) return { ok: false, errors: { tempPassword: strength } };

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return { ok: false, errors: { email: "An account with this email already exists." } };

  // Resolve the role and the chosen permission matrix, capped to what the actor holds.
  let rolePerms: PermissionMap = {};
  if (data.roleId) {
    const role = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!role) return { ok: false, errors: { roleId: "That role no longer exists." } };
    rolePerms = parsePermissionMap(role.permissions);
  }
  const chosen = grantablePermissions(actor.authz, parseMatrix(data.permissions) ?? {});
  const overrides = diffPermissions(rolePerms, chosen);

  if (data.reportingManagerId) {
    const mgr = await prisma.user.findUnique({ where: { id: data.reportingManagerId } });
    if (!mgr) return { ok: false, errors: { reportingManagerId: "That manager no longer exists." } };
  }

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(data.tempPassword),
      accountType: targetType,
      status: "ACTIVE",
      mustChangePassword: true,
      roleId: data.roleId || null,
      permissionOverrides:
        overrides.add || overrides.remove ? JSON.stringify(overrides) : null,
      department: data.department || null,
      jobTitle: data.jobTitle || null,
      phone: data.phone || null,
      employeeId: data.employeeId || null,
      reportingManagerId: data.reportingManagerId || null,
      expiresAt: parseExpiry(data.expiresAt),
      notes: data.notes || null,
      createdById: actor.id,
    },
  });

  // Give the new account access to the same store(s), so it has a working
  // context. The legacy StoreMember.role is not used for authorization (RBAC
  // decides that); VIEWER is a neutral default.
  const stores = await prisma.storeMember.findMany({
    where: { userId: actor.id },
    select: { storeId: true },
  });
  if (stores.length) {
    await prisma.storeMember.createMany({
      data: stores.map((s) => ({ userId: user.id, storeId: s.storeId, role: "VIEWER" })),
    });
  }

  const storeId = await auditStoreId(actor.id);
  if (storeId) {
    await recordAudit({
      storeId,
      userId: actor.id,
      entity: "User",
      entityId: user.id,
      action: "CREATE",
      summary: `Created ${targetType.toLowerCase()} account ${user.email}`,
      after: { accountType: targetType, roleId: data.roleId ?? null, permissions: chosen },
    });
  }

  revalidatePath("/settings/users");
  return { ok: true, message: `Account created for ${user.email}. Share the temporary password with them.` };
}

/** Loads a target and checks the actor may manage it; returns an error state otherwise. */
async function loadManageableTarget(actorAuthz: Parameters<typeof canManageTarget>[0], actorId: string, targetId: string) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { error: { ok: false as const, message: "That account no longer exists." } };
  if (target.id === actorId) {
    return { error: { ok: false as const, message: "You cannot change your own account here." } };
  }
  if (!canManageTarget(actorAuthz, { accountType: target.accountType as AccountType, id: target.id })) {
    return { error: { ok: false as const, message: "You do not have permission to manage this account." } };
  }
  return { target };
}

const updateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2, "Enter the person's name.").max(100),
  department: z.string().trim().max(100).optional(),
  jobTitle: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  employeeId: z.string().trim().max(60).optional(),
  reportingManagerId: z.string().optional(),
  expiresAt: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function updateUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await assertPermission("User Management", "Edit");
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };

  const { target, error } = await loadManageableTarget(actor.authz, actor.id, parsed.data.id);
  if (error) return error;

  await prisma.user.update({
    where: { id: target!.id },
    data: {
      name: parsed.data.name,
      department: parsed.data.department || null,
      jobTitle: parsed.data.jobTitle || null,
      phone: parsed.data.phone || null,
      employeeId: parsed.data.employeeId || null,
      reportingManagerId: parsed.data.reportingManagerId || null,
      expiresAt: parseExpiry(parsed.data.expiresAt),
      notes: parsed.data.notes || null,
    },
  });

  const storeId = await auditStoreId(actor.id);
  if (storeId) {
    await recordAudit({
      storeId,
      userId: actor.id,
      entity: "User",
      entityId: target!.id,
      action: "UPDATE",
      summary: `Updated account ${target!.email}`,
    });
  }
  revalidatePath("/settings/users");
  return { ok: true, message: "Account updated." };
}

/** Change role and/or the permission matrix. Takes effect on the user's next request. */
export async function setUserAccessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await assertPermission("User Management", "Manage");
  const id = String(formData.get("id") ?? "");
  const roleId = (formData.get("roleId") as string) || null;
  const permissionsJson = formData.get("permissions") as string | null;

  const { target, error } = await loadManageableTarget(actor.authz, actor.id, id);
  if (error) return error;

  let rolePerms: PermissionMap = {};
  if (roleId) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return { ok: false, message: "That role no longer exists." };
    rolePerms = parsePermissionMap(role.permissions);
  }
  const chosen = grantablePermissions(actor.authz, parseMatrix(permissionsJson));
  const overrides = diffPermissions(rolePerms, chosen);

  await prisma.user.update({
    where: { id: target!.id },
    data: {
      roleId,
      permissionOverrides: overrides.add || overrides.remove ? JSON.stringify(overrides) : null,
    },
  });

  const storeId = await auditStoreId(actor.id);
  if (storeId) {
    await recordAudit({
      storeId,
      userId: actor.id,
      entity: "User",
      entityId: target!.id,
      action: "UPDATE",
      summary: `Changed access for ${target!.email}`,
      after: { roleId, permissions: chosen },
    });
  }
  revalidatePath("/settings/users");
  return { ok: true, message: "Access updated." };
}

export async function setUserStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await assertPermission("User Management", "Manage");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["ACTIVE", "SUSPENDED", "DEACTIVATED"].includes(status)) {
    return { ok: false, message: "Unknown status." };
  }

  const { target, error } = await loadManageableTarget(actor.authz, actor.id, id);
  if (error) return error;

  await prisma.user.update({ where: { id: target!.id }, data: { status } });

  // Downgrades revoke access immediately.
  if (status === "SUSPENDED" || status === "DEACTIVATED") {
    await prisma.session.deleteMany({ where: { userId: target!.id } });
  }

  const storeId = await auditStoreId(actor.id);
  if (storeId) {
    await recordAudit({
      storeId,
      userId: actor.id,
      entity: "User",
      entityId: target!.id,
      action: "UPDATE",
      summary: `Set ${target!.email} to ${status.toLowerCase()}`,
    });
  }
  revalidatePath("/settings/users");
  return { ok: true, message: `Account ${status.toLowerCase()}.` };
}

export async function resetUserPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await assertPermission("User Management", "Manage");
  const id = String(formData.get("id") ?? "");

  const { target, error } = await loadManageableTarget(actor.authz, actor.id, id);
  if (error) return error;

  const temp = generateTempPassword();
  await prisma.user.update({
    where: { id: target!.id },
    data: { passwordHash: await hashPassword(temp), mustChangePassword: true },
  });
  await prisma.session.deleteMany({ where: { userId: target!.id } });

  const storeId = await auditStoreId(actor.id);
  if (storeId) {
    await recordAudit({
      storeId,
      userId: actor.id,
      entity: "User",
      entityId: target!.id,
      action: "UPDATE",
      summary: `Reset password for ${target!.email}`,
    });
  }
  revalidatePath("/settings/users");
  // The temp password is returned once so the admin can hand it over.
  return { ok: true, message: `New temporary password: ${temp}` };
}

export async function revokeUserSessionsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await assertPermission("User Management", "Manage");
  const id = String(formData.get("id") ?? "");

  const { target, error } = await loadManageableTarget(actor.authz, actor.id, id);
  if (error) return error;

  const { count } = await prisma.session.deleteMany({ where: { userId: target!.id } });

  const storeId = await auditStoreId(actor.id);
  if (storeId) {
    await recordAudit({
      storeId,
      userId: actor.id,
      entity: "User",
      entityId: target!.id,
      action: "UPDATE",
      summary: `Revoked ${count} session(s) for ${target!.email}`,
    });
  }
  revalidatePath("/settings/users");
  return { ok: true, message: `Signed out of ${count} session(s).` };
}
