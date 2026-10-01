import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Liveness check for the hosting platform. Returns 200 only when the database
 * answers, so a deploy with a broken DATABASE_URL never goes live.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
