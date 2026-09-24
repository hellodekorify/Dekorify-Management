import type { Metadata } from "next";
import { History } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";

export const metadata: Metadata = { title: "Activity log" };

const PAGE_SIZE = 30;

const ACTION_TONE: Record<string, "positive" | "negative" | "info" | "neutral" | "warning"> = {
  CREATE: "positive",
  UPDATE: "info",
  DELETE: "negative",
  RESTORE: "warning",
  IMPORT: "info",
  EXPORT: "neutral",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { store } = await requireContext();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { storeId: store.id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where: { storeId: store.id } }),
  ]);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Activity log"
        description="Every change to a financial record, so any figure can be traced back to who changed it and when."
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing recorded yet"
          description="Creating, editing, deleting or importing records will show up here."
        />
      ) : (
        <>
          <ul className="divide-y divide-border-subtle">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <Badge tone={ACTION_TONE[entry.action] ?? "neutral"} className="mt-0.5 shrink-0">
                  {entry.action.toLowerCase()}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-foreground">
                    {entry.summary ?? `${entry.action} on ${entry.entity}`}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {entry.user?.name ?? "System"} ·{" "}
                    {entry.createdAt.toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] text-subtle">{entry.entity}</span>
              </li>
            ))}
          </ul>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            hrefFor={(value) =>
              value <= 1 ? "/settings/activity" : `/settings/activity?page=${value}`
            }
          />
        </>
      )}
    </Card>
  );
}
