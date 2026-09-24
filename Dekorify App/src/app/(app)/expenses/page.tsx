import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { Repeat, Tags } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { amountFilter, makeLinkBuilders, parseListParams } from "@/lib/list-params";
import { formatMoney, formatPercent } from "@/lib/currency";
import { formatDate, toInputDate } from "@/lib/dates";
import { fxRateToNumber, percentOf, toDecimalString } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/constants";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import {
  AmountFilter,
  ClearFiltersButton,
  FilterBar,
  FilterSelect,
  SearchInput,
} from "@/components/filters/table-filters";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { SummaryTile } from "@/components/ui/summary-tile";
import { Pagination } from "@/components/ui/pagination";
import { TableEmpty, TableWrap, TD, TFootRow, TH, THead } from "@/components/ui/table";
import { AddExpenseButton, ExpenseRow, type ExpenseRowData } from "./expenses-client";

export const metadata: Metadata = { title: "Expenses" };

const SORT_COLUMNS: Record<string, string> = {
  date: "date",
  name: "name",
  amount: "baseAmountMinor",
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { store } = await requireContext();
  const raw = await searchParams;
  const params = parseListParams(raw, { defaultSort: "date", defaultDir: "desc" });
  const links = makeLinkBuilders("/expenses", raw);

  const where: Prisma.ExpenseWhereInput = {
    storeId: store.id,
    deletedAt: null,
    date: { gte: params.range.from, lte: params.range.to },
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search } },
            { vendorName: { contains: params.search } },
            { description: { contains: params.search } },
            { notes: { contains: params.search } },
          ],
        }
      : {}),
    ...(raw.category ? { categoryId: raw.category } : {}),
    ...(raw.method ? { paymentMethod: raw.method } : {}),
    ...(amountFilter(params) ? { baseAmountMinor: amountFilter(params) } : {}),
  };

  const orderBy = { [SORT_COLUMNS[params.sort] ?? "date"]: params.dir } as Prisma.ExpenseOrderByWithRelationInput;

  const [rows, total, aggregate, categories, suppliers, byCategory, recurringCount] =
    await Promise.all([
      prisma.expense.findMany({
        where,
        include: { category: { select: { id: true, name: true, color: true } } },
        orderBy: [orderBy, { createdAt: "desc" }],
        skip: params.skip,
        take: params.pageSize,
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({ where, _sum: { baseAmountMinor: true } }),
      prisma.expenseCategory.findMany({
        where: { storeId: store.id, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, kind: true, color: true },
      }),
      prisma.supplier.findMany({
        where: { storeId: store.id, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.expense.groupBy({
        by: ["categoryId"],
        where,
        _sum: { baseAmountMinor: true },
        orderBy: { _sum: { baseAmountMinor: "desc" } },
        take: 1,
      }),
      prisma.recurringExpense.count({ where: { storeId: store.id, isActive: true, deletedAt: null } }),
    ]);

  const periodTotal = aggregate._sum.baseAmountMinor ?? 0n;
  const currency = store.baseCurrency;
  const pageTotal = rows.reduce((sum, row) => sum + row.baseAmountMinor, 0n);

  const topCategoryId = byCategory[0]?.categoryId;
  const topCategory = categories.find((category) => category.id === topCategoryId);
  const topCategoryAmount = byCategory[0]?._sum.baseAmountMinor ?? 0n;

  const expenses: ExpenseRowData[] = rows.map((row) => ({
    id: row.id,
    date: formatDate(row.date),
    dateInput: toInputDate(row.date),
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? "Uncategorised",
    categoryColor: row.category?.color ?? null,
    amountFormatted: formatMoney(row.amountMinor, row.currency, { decimals: true }),
    amountInput: toDecimalString(row.amountMinor),
    currency: row.currency,
    fxRateInput: String(fxRateToNumber(row.fxRateE8)),
    baseAmountFormatted: formatMoney(row.baseAmountMinor, currency),
    isForeign: row.currency !== currency,
    paymentMethod: row.paymentMethod,
    vendorName: row.vendorName,
    supplierId: row.supplierId,
    description: row.description,
    notes: row.notes,
    receiptFileName: row.receiptFileName,
    isRecurring: row.recurringExpenseId !== null,
  }));

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Every cost the business carries, from rent and salaries to packaging and bank charges."
        actions={
          <>
            <LinkButton href="/expenses/recurring" className="gap-2">
              <Repeat className="h-4 w-4" aria-hidden />
              Recurring
              {recurringCount > 0 && (
                <span className="rounded-full bg-brand-soft px-1.5 text-[11px] font-semibold text-brand">
                  {recurringCount}
                </span>
              )}
            </LinkButton>
            <LinkButton href="/expenses/categories" className="gap-2">
              <Tags className="h-4 w-4" aria-hidden />
              Categories
            </LinkButton>
            <AddExpenseButton
              categories={categories}
              suppliers={suppliers}
              baseCurrency={currency}
            />
          </>
        }
        filters={
          <FilterBar>
            <SearchInput placeholder="Search name, vendor or notes…" />
            <FilterSelect
              param="category"
              label="Category"
              allLabel="All categories"
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
            />
            <FilterSelect
              param="method"
              label="Payment method"
              allLabel="Any payment method"
              options={PAYMENT_METHODS.map((method) => ({
                value: method.value,
                label: method.label,
              }))}
            />
            <AmountFilter />
            <DateRangeFilter label={params.range.label} />
            <ClearFiltersButton />
          </FilterBar>
        }
      />

      <PageBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryTile
            label={`Total for ${params.range.label.toLowerCase()}`}
            value={formatMoney(periodTotal, currency)}
            sub={`${total.toLocaleString()} expense${total === 1 ? "" : "s"}`}
          />
          <SummaryTile
            label="Average per expense"
            value={formatMoney(total > 0 ? periodTotal / BigInt(total) : 0n, currency)}
            sub={total === 0 ? "Nothing recorded yet" : "Across the filtered results"}
          />
          <SummaryTile
            label="Largest category"
            value={topCategory?.name ?? "—"}
            sub={
              topCategory
                ? `${formatMoney(topCategoryAmount, currency)} · ${formatPercent(
                    percentOf(topCategoryAmount, periodTotal),
                    0,
                  )} of the total`
                : "Nothing recorded yet"
            }
          />
        </div>

        <Card className="overflow-hidden">
          <TableWrap>
            <THead>
              <TH sortKey="date" currentSort={params.sort} currentDir={params.dir} sortHref={links.sortHref}>
                Date
              </TH>
              <TH sortKey="name" currentSort={params.sort} currentDir={params.dir} sortHref={links.sortHref}>
                Expense
              </TH>
              <TH>Category</TH>
              <TH>Vendor</TH>
              <TH>Paid by</TH>
              <TH
                align="right"
                sortKey="amount"
                currentSort={params.sort}
                currentDir={params.dir}
                sortHref={links.sortHref}
              >
                Amount
              </TH>
              <TH width="52px" />
            </THead>

            <tbody>
              {expenses.length === 0 ? (
                <TableEmpty
                  colSpan={7}
                  title="No expenses match these filters"
                  description="Try widening the date range, clearing the filters, or add your first expense."
                  action={
                    <AddExpenseButton
                      categories={categories}
                      suppliers={suppliers}
                      baseCurrency={currency}
                    />
                  }
                />
              ) : (
                expenses.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    categories={categories}
                    suppliers={suppliers}
                    baseCurrency={currency}
                  />
                ))
              )}
            </tbody>

            {expenses.length > 0 && (
              <TFootRow>
                <TD colSpan={5} className="text-[13px] text-muted-strong">
                  Total on this page
                </TD>
                <TD numeric align="right">
                  {formatMoney(pageTotal, currency)}
                </TD>
                <TD />
              </TFootRow>
            )}
          </TableWrap>

          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={total}
            hrefFor={links.pageHref}
          />
        </Card>
      </PageBody>
    </>
  );
}
