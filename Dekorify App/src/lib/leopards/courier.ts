import { prisma } from "../db";
import { LEOPARDS_DEFAULT_MAPPINGS } from "./status-map";
import type { LeopardsCredentials, LeopardsEnvironment } from "./client";

export const LEOPARDS_CODE = "LEOPARDS";

export const LEOPARDS_TRACKING_URL = "https://www.leopardscourier.com/tracking?tracking_number={cn}";

/**
 * Credentials resolve env-first, then the courier row.
 *
 * Environment variables win so a deployment can rotate keys without touching
 * the database, and so a shared demo database never carries live credentials.
 */
export function resolveCredentials(courier: {
  apiKey: string | null;
  apiPassword: string | null;
  apiEnvironment: string;
}): LeopardsCredentials | null {
  const apiKey = process.env.LEOPARDS_API_KEY?.trim() || courier.apiKey?.trim();
  const apiPassword = process.env.LEOPARDS_API_PASSWORD?.trim() || courier.apiPassword?.trim();

  if (!apiKey || !apiPassword) return null;

  const fromEnv = process.env.LEOPARDS_API_ENVIRONMENT?.trim();
  const environment = (fromEnv || courier.apiEnvironment || "production") as LeopardsEnvironment;

  return {
    apiKey,
    apiPassword,
    environment: environment === "staging" ? "staging" : "production",
  };
}

export function credentialsConfigured(courier: {
  apiKey: string | null;
  apiPassword: string | null;
  apiEnvironment: string;
}): boolean {
  return resolveCredentials(courier) !== null;
}

/** Whether the keys come from the environment rather than the database. */
export function credentialsFromEnv(): boolean {
  return Boolean(process.env.LEOPARDS_API_KEY?.trim() && process.env.LEOPARDS_API_PASSWORD?.trim());
}

/**
 * Creates the Leopards courier row for a store if it is missing, along with
 * the default status mappings. Idempotent.
 */
export async function ensureLeopardsCourier(storeId: string): Promise<string> {
  const existing = await prisma.courier.findUnique({
    where: { storeId_code: { storeId, code: LEOPARDS_CODE } },
  });

  if (existing) {
    await ensureDefaultMappings(existing.id);
    return existing.id;
  }

  const courier = await prisma.courier.create({
    data: {
      storeId,
      name: "Leopards Courier",
      code: LEOPARDS_CODE,
      isDefault: true,
      apiEnvironment: "production",
      trackingUrlTemplate: LEOPARDS_TRACKING_URL,
    },
  });

  await ensureDefaultMappings(courier.id);
  return courier.id;
}

/** Adds any default mapping the courier does not already have. */
export async function ensureDefaultMappings(courierId: string): Promise<number> {
  const existing = await prisma.courierStatusMapping.findMany({
    where: { courierId },
    select: { courierStatus: true },
  });
  const have = new Set(existing.map((row) => row.courierStatus));

  const missing = LEOPARDS_DEFAULT_MAPPINGS.filter(
    (mapping) => !have.has(mapping.courierStatus.toLowerCase()),
  );

  if (missing.length === 0) return 0;

  await prisma.courierStatusMapping.createMany({
    data: missing.map((mapping, index) => ({
      courierId,
      courierStatus: mapping.courierStatus.toLowerCase(),
      internalStatus: mapping.internalStatus,
      isIssue: mapping.isIssue ?? false,
      isAttempt: mapping.isAttempt ?? false,
      isTerminal: mapping.isTerminal ?? false,
      sortOrder: have.size + index,
    })),
  });

  return missing.length;
}

export function trackingUrlFor(
  courier: { trackingUrlTemplate: string | null } | null,
  trackingNumber: string | null,
): string | null {
  if (!trackingNumber) return null;
  const template = courier?.trackingUrlTemplate ?? LEOPARDS_TRACKING_URL;
  return template.replace("{cn}", encodeURIComponent(trackingNumber));
}
