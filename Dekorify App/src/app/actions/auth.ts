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
  hashPassword,
  requireUser,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth";
import { createStoreForUser } from "@/lib/store-setup";
import { firstErrors } from "@/lib/utils";

export type FormState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  token?: string;
} | null;

const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Please choose a password."),
  storeName: z.string().trim().min(2, "Enter your business or store name.").max(120),
  baseCurrency: z.string().trim().length(3).default("PKR"),
});

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    storeName: formData.get("storeName"),
    baseCurrency: formData.get("baseCurrency") || "PKR",
  });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const { name, email, password, storeName, baseCurrency } = parsed.data;

  const passwordProblem = validatePasswordStrength(password);
  if (passwordProblem) {
    return { ok: false, errors: { password: passwordProblem } };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      ok: false,
      errors: { email: "An account with this email already exists. Try signing in instead." },
    };
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  });

  await createStoreForUser(user.id, { name: storeName, baseCurrency });

  const headerList = await headers();
  await createSession(user.id, headerList.get("user-agent") ?? undefined);

  redirect("/");
}

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

  // Same message either way — never reveal whether an email is registered.
  const invalid: FormState = { ok: false, message: "Email or password is incorrect." };
  if (!user) return invalid;

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return invalid;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const headerList = await headers();
  await createSession(user.id, headerList.get("user-agent") ?? undefined);

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
