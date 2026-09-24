import type { Metadata } from "next";
import { ArrowLeft, Repeat } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import { formatDate, toInputDate } from "@/lib/dates";
import { fxRateToNumber, toDecimalString } from "@/lib/money";
import { dueOccurrences, frequencyLabel, nextOccurrence } from "@/lib/recurring";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { SummaryTile } from "@/components/ui/summary-tile";
import {
  AddRecurringButton,
  PostDueBanner,
  RecurringCard,
  type RecurringRowData,
} from "./recurring-client";

export const metadata: Metadata = { title: "Recurring expenses" };

export default async function RecurringExpensesPage() {
  const { store } = await requireContext();

  const [schedules, categories] = await Promise.all([
    prisma.recurringExpense.findMany({
      where: { storeId: store.id, deletedAt: null },
      include: { category: { select: { id: true, name: true, color: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.expenseCategory.findMany({
      where: { storeId: store.id, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, color: true },
    }),
  ]);

  const now = new Date();
  const currency = store.baseCurrency;

  const rows: RecurringRowData[] = schedules.map((schedule) => {
    const due = schedule.isActive ? dueOccurrences(schedule, now) : [];
    const next = nextOccurrence(schedule, now);

    return {
      id: schedule.id,
      name: schedule.name,
      categoryId: schedule.categoryId,
      categoryName: schedule.category?.name ?? "Uncategorised",
      categoryColor: schedule.category?.color ?? null,
      amountInput: toDecimalString(schedule.amountMinor),
      currency: schedule.currency,
      fxRateInput: String(fxRateToNumber(schedule.fxRateE8)),
      isForeign: schedule.currency !== currency,
      baseAmountFormatted: formatMoney(schedule.baseAmountMinor, currency),
      frequency: schedule.frequency,
      frequencyLabel: frequencyLabel(schedule.frequency),
      startDateInput: toInputDate(schedule.startDate),
      endDateInput: toInputDate(schedule.endDate),
      dayOfMonth: schedule.dayOfMonth,
      paymentMethod: schedule.paymentMethod,
      vendorName: schedule.vendorName,
      notes: schedule.notes,
      isActive: schedule.isActive,
      nextDate: next ? formatDate(next) : "—",
      dueCount: due.length,
    };
  });

  const dueTotal = rows.reduce((sum, row) => sum + row.dueCount, 0);
  const activeRows = rows.filter((row) => row.isActive);

  // Monthly-equivalent commitment, so weekly and yearly items are comparable.
  const monthlyCommitment = schedules
    .filter((schedule) => schedule.isActive)
    .reduce((sum, schedule) => {
      switch (schedule.frequency) {
        case "WEEKLY":
          return sum + (schedule.baseAmountMinor * 52n) / 12n;
        case "MONTHLY":
          return sum + schedule.baseAmountMinor;
        case "QUARTERLY":
          return sum + schedule.baseAmountMinor / 3n;
        case "YEARLY":
          return sum + schedule.baseAmountMinor / 12n;
        default:
          return sum;
      }
    }, 0n);

  return (
    <>
      <PageHeader
        title="Recurring expenses"
        description="Costs that repeat on a schedule — rent, salaries, subscriptions. Post the entries when they fall due."
        actions={
          <>
            <LinkButton href="/expenses" className="gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to expenses
            </LinkButton>
            <AddRecurringButton categories={categories} baseCurrency={currency} />
          </>
        }
      />

      <PageBody>
        <div className="max-w-4xl space-y-4">
          <PostDueBanner dueTotal={dueTotal} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryTile
              label="Active schedules"
              value={String(activeRows.length)}
              sub={
                rows.length - activeRows.length > 0
                  ? `${rows.length - activeRows.length} paused`
                  : "All running"
              }
            />
            <SummaryTile
              label="Committed per month"
              value={formatMoney(monthlyCommitment, currency)}
              sub="Weekly and yearly items converted to a monthly equivalent"
            />
            <SummaryTile
              label="Waiting to be posted"
              value={String(dueTotal)}
              sub={dueTotal === 0 ? "Nothing outstanding" : "Not yet in your reports"}
            />
          </div>

          {rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={Repeat}
                title="No recurring expenses yet"
                description="Set up the costs that repeat every month so you never have to type them again — rent, salaries, Shopify, internet, agency fees."
                action={<AddRecurringButton categories={categories} baseCurrency={currency} />}
              />
            </Card>
          ) : (
            <div className="space-y-2.5">
              {rows.map((schedule) => (
                <RecurringCard
                  key={schedule.id}
                  schedule={schedule}
                  categories={categories}
                  baseCurrency={currency}
                />
              ))}
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
