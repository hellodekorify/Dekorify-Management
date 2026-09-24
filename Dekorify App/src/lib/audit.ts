import { prisma } from "./db";

/**
 * Financial records must be traceable. Every create, update and delete writes
 * one of these; the snapshots make it possible to see exactly what a figure
 * looked like before it was changed.
 */
export async function recordAudit(input: {
  storeId: string;
  userId?: string | null;
  entity: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "IMPORT" | "EXPORT";
  summary?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      storeId: input.storeId,
      userId: input.userId ?? null,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      summary: input.summary,
      before: input.before ? safeStringify(input.before) : null,
      after: input.after ? safeStringify(input.after) : null,
    },
  });
}

/** JSON.stringify cannot serialise BigInt, which every money column is. */
export function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}
