import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/button";
import { CategoriesManager, type CategoryRow } from "./categories-client";
import type { CategoryKind } from "@/lib/constants";

export const metadata: Metadata = { title: "Expense categories" };

export default async function CategoriesPage() {
  const { store } = await requireContext();

  const [categories, usage] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { storeId: store.id, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where: { storeId: store.id, deletedAt: null },
      _count: { _all: true },
      _sum: { baseAmountMinor: true },
    }),
  ]);

  const usageById = new Map(
    usage.map((row) => [
      row.categoryId,
      { count: row._count._all, total: row._sum.baseAmountMinor ?? 0n },
    ]),
  );

  const rows: CategoryRow[] = categories.map((category) => {
    const stats = usageById.get(category.id);
    return {
      id: category.id,
      name: category.name,
      kind: category.kind as CategoryKind,
      color: category.color,
      sortOrder: category.sortOrder,
      isSystem: category.isSystem,
      usageCount: stats?.count ?? 0,
      totalFormatted: formatMoney(stats?.total ?? 0n, store.baseCurrency),
    };
  });

  return (
    <>
      <PageHeader
        title="Expense categories"
        description="Create, rename, reorder and remove the headings your expenses are grouped under."
        actions={
          <LinkButton href="/expenses" className="gap-2">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to expenses
          </LinkButton>
        }
      />
      <PageBody>
        <div className="max-w-3xl">
          <CategoriesManager categories={rows} />
        </div>
      </PageBody>
    </>
  );
}
