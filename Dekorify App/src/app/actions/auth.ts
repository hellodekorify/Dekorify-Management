"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  ACTIVE_STORE_COOKIE,
  consumePasswordResetToken,
  createPasswordResetToken,
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  needsSuperAdminSetup,
  requireUser,
  superAdminEmail,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth";
import { createStoreForUser } from "@/lib/store-setup";
import { ensureSystemRoles } from "@/lib/rbac-roles";
import { recordAudit } from "@/lib/audit";
import { firstErrors } from "@/lib/utils";

export type FormState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  token?: string;
} | null;

// Public self-registration is disabled: the only way an account comes into
// being is the Super Admin bootstrap below, or a Super Admin creating one.

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  // Same message either way — never reveal whether an email is registered, nor
  // whether an account is suspended/deactivated.
  const invalid: FormState = { ok: false, message: "Email or password is incorrect." };
  if (!user) return invalid;

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return invalid;

  // Only ACTIVE accounts may sign in. INVITED/SUSPENDED/DEACTIVATED are refused
  // with the same generic message.
  if (user.status !== "ACTIVE") return invalid;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const headerList = await headers();
  await createSession(user.id, headerList.get("user-agent") ?? undefined);

  // A temp password must be changed before the app is usable.
  redirect(user.mustChangePassword ? "/change-password" : "/");
}

// ---------------------------------------------------------------------------
// First-run Super Admin setup
// ---------------------------------------------------------------------------

const setupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100),
  password: z.string().min(1, "Choose a password."),
  confirmPassword: z.string().min(1, "Confirm your password."),
});

/**
 * Completes the one-time Super Admin bootstrap. Only works while setup is still
 * pending (SUPER_ADMIN_EMAIL set and that account not yet an active Super
 * Admin), so it cannot be used to seize control once configured.
 */
export async function completeSuperAdminSetupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await needsSuperAdminSetup())) {
    return { ok: false, message: "Setup has already been completed." };
  }
  const email = superAdminEmail();
  if (!email) return { ok: false, message: "SUPER_ADMIN_EMAIL is not configured." };

  const parsed = setupSchema.safeParse({
    name: formData.get("name"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { ok: false, errors: { confirmPassword: "The two passwords do not match." } };
  }
  const problem = validatePasswordStrength(parsed.data.password);
  if (problem) return { ok: false, errors: { password: problem } };

  await ensureSystemRoles();

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: parsed.data.name,
      passwordHash,
      accountType: "SUPER_ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
    },
    create: {
      email,
      name: parsed.data.name,
      passwordHash,
      accountType: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  // Ensure a store exists and the Super Admin is a member, so the app opens.
  const membership = await prisma.storeMember.findFirst({ where: { userId: user.id } });
  if (!membership) {
    const anyStore = await prisma.store.findFirst({ orderBy: { createdAt: "asc" } });
    if (anyStore) {
      await prisma.storeMember.create({
        data: { userId: user.id, storeId: anyStore.id, role: "OWNER" },
      });
    } else {
      await createStoreForUser(user.id, { name: "Dekorify", baseCurrency: "PKR" });
    }
  }

  await recordAudit({
    storeId: (await prisma.storeMember.findFirstOrThrow({ where: { userId: user.id } })).storeId,
    userId: user.id,
    entity: "User",
    entityId: user.id,
    action: "CREATE",
    summary: `Super Admin account activated for ${email}`,
  });

  const headerList = await headers();
  await createSession(user.id, headerList.get("user-agent") ?? undefined);
  redirect("/");
}

// ---------------------------------------------------------------------------
// Forced change of a temporary password
// ---------------------------------------------------------------------------

const forcedChangeSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current (temporary) password."),
  newPassword: z.string().min(1, "Choose a new password."),
  confirmPassword: z.string().min(1, "Confirm your new password."),
});

/**
 * Sets a real password for a user flagged `mustChangePassword` (e.g. one whose
 * password was set by an admin). Uses getCurrentUser directly so it is not
 * caught by requireUser's redirect-to-change-password guard.
 */
export async function forceChangePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const parsed = forcedChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { ok: false, errors: { confirmPassword: "The two passwords do not match." } };
  }
  const problem = validatePasswordStrength(parsed.data.newPassword);
  if (problem) return { ok: false, errors: { newPassword: problem } };

  const record = await prisma.user.findUniqueOrThrow({ where: { id: current.id } });
  const valid = await verifyPassword(parsed.data.currentPassword, record.passwordHash);
  if (!valid) {
    return { ok: false, errors: { currentPassword: "That is not your current password." } };
  }

  await prisma.user.update({
    where: { id: current.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
    },
  });

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_STORE_COOKIE);
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!z.string().email().safeParse(email).success) {
    return { ok: false, errors: { email: "Enter a valid email address." } };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Always report success so this cannot be used to enumerate accounts.
  if (!user) {
    return {
      ok: true,
      message: "If an account exists for that address, a reset link has been created.",
    };
  }

  const token = await createPasswordResetToken(user.id);

  // No mail server is configured, so the link is surfaced in the UI. Swap this
  // for an email send when SMTP credentials are available.
  return {
    ok: true,
    message: "Reset link created. It is valid for one hour.",
    token,
  };
}

const resetSchema = z.object({
  token: z.string().min(10, "This reset link is not valid."),
  password: z.string().min(1, "Choose a new password."),
  confirmPassword: z.string().min(1, "Confirm your new password."),
});

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { ok: false, errors: { confirmPassword: "The two passwords do not match." } };
  }

  const problem = validatePasswordStrength(parsed.data.password);
  if (problem) return { ok: false, errors: { password: problem } };

  const userId = await consumePasswordResetToken(parsed.data.token);
  if (!userId) {
    return { ok: false, message: "This reset link has expired or has already been used." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });

  // Any other device holding a session for this account is signed out.
  await prisma.session.deleteMany({ where: { userId } });

  redirect("/login?reset=1");
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = z
    .object({
      name: z.string().trim().min(2, "Please enter your name.").max(100),
      email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    })
    .safeParse({ name: formData.get("name"), email: formData.get("email") });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  if (parsed.data.email !== user.email) {
    const taken = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (taken) return { ok: false, errors: { email: "That email is already in use." } };
  }

  await prisma.user.update({ where: { id: user.id }, data: parsed.data });
  return { ok: true, message: "Profile updated." };
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const currentUser = await requireUser();

  const parsed = z
    .object({
      currentPassword: z.string().min(1, "Enter your current password."),
      newPassword: z.string().min(1, "Choose a new password."),
      confirmPassword: z.string().min(1, "Confirm your new password."),
    })
    .safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { ok: false, errors: { confirmPassword: "The two passwords do not match." } };
  }

  const problem = validatePasswordStrength(parsed.data.newPassword);
  if (problem) return { ok: false, errors: { newPassword: problem } };

  const record = await prisma.user.findUniqueOrThrow({ where: { id: currentUser.id } });
  const valid = await verifyPassword(parsed.data.currentPassword, record.passwordHash);
  if (!valid) {
    return { ok: false, errors: { currentPassword: "That is not your current password." } };
  }

  await prisma.user.update({
    where: { id: currentUser.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });

  return { ok: true, message: "Password changed." };
}
