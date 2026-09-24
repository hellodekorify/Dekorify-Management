import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const SESSION_COOKIE = "dekorify_session";
const SESSION_DAYS = 30;
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters long.";
  if (password.length > 200) return "Password is too long.";
  if (!/[a-zA-Z]/.test(password)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  return null;
}

// ---------------------------------------------------------------------------
// Sessions
//
// The cookie carries a raw random token; the database stores only its SHA-256
// hash, so a leaked database cannot be replayed as a live session.
// ---------------------------------------------------------------------------

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, userAgent?: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 255) },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return session.user;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// ---------------------------------------------------------------------------
// Store context
// ---------------------------------------------------------------------------

export interface CurrentStore {
  id: string;
  name: string;
  baseCurrency: string;
  timezone: string;
  shopifyDomain: string | null;
  shopifyConnectedAt: Date | null;
}

export const ACTIVE_STORE_COOKIE = "dekorify_store";

/**
 * The store the user is currently looking at. Falls back to their first store.
 * Always filtered by membership, so a forged cookie cannot reach another
 * account's data.
 */
export async function getCurrentStore(userId: string): Promise<CurrentStore | null> {
  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTIVE_STORE_COOKIE)?.value;

  if (requestedId) {
    const membership = await prisma.storeMember.findUnique({
      where: { userId_storeId: { userId, storeId: requestedId } },
      include: { store: true },
    });
    if (membership) return toCurrentStore(membership.store);
  }

  const first = await prisma.storeMember.findFirst({
    where: { userId },
    include: { store: true },
    orderBy: { createdAt: "asc" },
  });

  return first ? toCurrentStore(first.store) : null;
}

function toCurrentStore(store: {
  id: string;
  name: string;
  baseCurrency: string;
  timezone: string;
  shopifyDomain: string | null;
  shopifyConnectedAt: Date | null;
}): CurrentStore {
  return {
    id: store.id,
    name: store.name,
    baseCurrency: store.baseCurrency,
    timezone: store.timezone,
    shopifyDomain: store.shopifyDomain,
    shopifyConnectedAt: store.shopifyConnectedAt,
  };
}

export interface AppContext {
  user: CurrentUser;
  store: CurrentStore;
}

/** Every page and mutation in the app area goes through this. */
export async function requireContext(): Promise<AppContext> {
  const user = await requireUser();
  const store = await getCurrentStore(user.id);
  // /new-store sits outside the app shell precisely so this cannot loop.
  if (!store) redirect("/new-store");
  return { user, store };
}

/** Confirms the signed-in user may touch this store. Throws otherwise. */
export async function assertStoreAccess(userId: string, storeId: string): Promise<void> {
  const membership = await prisma.storeMember.findUnique({
    where: { userId_storeId: { userId, storeId } },
  });
  if (!membership) throw new Error("You do not have access to this store.");
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  return token;
}

export async function consumePasswordResetToken(token: string): Promise<string | null> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) return null;

  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return record.userId;
}

/** Constant-time compare for anything user-supplied that we check by equality. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
