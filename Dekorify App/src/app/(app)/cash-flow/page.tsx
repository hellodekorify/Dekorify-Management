import type { Metadata } from "next";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { buildCashFlow, buildTimeSeries, loadDataset } from "@/lib/finance";
import { resolveDateRange, formatDate, toInputDate, type DatePreset } from "@/lib/dates";
import { formatMoney } from "@/lib/currency";
import { fxRateToNumber, sumMoney, toDecimalString } from "@/lib/money";
import { CASH_ENTRY_CATEGORIES } from "@/lib/constants";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SummaryTile } from "@/components/ui/summary-tile";
import { TableEmpty, TableWrap, TH, THead } from "@/components/ui/table";
import { CashFlowChart } from "@/components/charts/chart-kit";
import { ExportMenu, type ExportPayload } from "@/components/export-menu";
import {
  AddCashEntryButton,
  CashAccountsPanel,
  CashEntryRow,
  type CashAccountData,
  type CashEntryRowData,
} from "./cash-client";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cash Flow" };

function categoryLabel(value: string): string {
  return CASH_ENTRY_CATEGORIES.find((category) => category.value === value)?.label ?? value;
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { store } = await requireContext();
  const params = await searchParams;

  const range = resolveDateRange(
    (params.range as DatePreset) ?? "this_month",
    params.from,
    params.to,
  );

  const [dataset, accountRows, entryRows] = await Promise.all([
    loadDataset(store.id, range),
    prisma.cashAccount.findMany({
      where: { storeId: store.id, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.cashEntry.findMany({
      where: {
        storeId: store.id,
        deletedAt: null,
        date: { gte: range.from, lte: range.to },
      },
      include: { account: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 100,
    }),
  ]);

  const statement = await buildCashFlow(store.id, dataset);
  const { points } = buildTimeSeries(dataset);
  const currency = store.baseCurrency;

  const accounts: CashAccountData[] = accountRows.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    openingBalanceInput: toDecimalString(account.openingBalanceMinor),
    openingBalanceFormatted: formatMoney(account.openingBalanceMinor, account.currency),
    openingDateInput: toInputDate(account.openingDate),
    openingDate: formatDate(account.openingDate),
  }));

  const entries: CashEntryRowData[] = entryRows.map((entry) => ({
    id: entry.id,
    date: formatDate(entry.date),
    dateInput: toInputDate(entry.date),
    direction: entry.direction,
    category: entry.category,
    categoryLabel: categoryLabel(entry.category),
    name: entry.name,
    amountInput: toDecimalString(entry.amountMinor),
    currency: entry.currency,
    fxRateInput: String(fxRateToNumber(entry.fxRateE8)),
    isForeign: entry.currency !== currency,
    amountFormatted: formatMoney(entry.amountMinor, entry.currency, { decimals: true }),
    baseAmountFormatted: formatMoney(entry.baseAmountMinor, currency),
    accountId: entry.accountId,
    accountName: entry.account?.name ?? null,
    notes: entry.notes,
  }));

  const totalOpening = sumMoney(accountRows.map((account) => account.openingBalanceMinor));

  const exportPayload: ExportPayload = {
    title: `Cash flow — ${store.name}`,
    subtitle: range.label,
    columns: ["", `Amount (${currency})`],
    numericColumns: [1],
    rows: [
      ["Opening balance", formatMoney(statement.openingBalance, currency, { showCode: false })],
      ["", ""],
      ["CASH IN", ""],
      ...statement.cashIn.map((row) => [
        row.label,
        formatMoney(row.amount, currency, { showCode: false }),
      ]),
      ["Total cash in", formatMoney(statement.totalIn, currency, { showCode: false })],
      ["", ""],
      ["CASH OUT", ""],
      ...statement.cashOut.map((row) => [
        row.label,
        formatMoney(row.amount, currency, { showCode: false }),
      ]),
      ["Total cash out", formatMoney(statement.totalOut, currency, { showCode: false })],
      ["", ""],
      ["Net movement", formatMoney(statement.netMovement, currency, { showCode: false })],
      ["Closing balance", formatMoney(statement.closingBalance, currency, { showCode: false })],
    ],
  };

  return (
    <>
      <PageHeader
        title="Cash flow"
        description="Where the money actually went. Opening balance, everything in, everything out, and what is left."
        actions={
          <>
            <DateRangeFilter label={range.label} />
            <ExportMenu payload={exportPayload} />
            <AddCashEntryButton accounts={accounts} baseCurrency={currency} />
          </>
        }
      />

      <PageBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            label="Opening balance"
            value={formatMoney(statement.openingBalance, currency)}
            sub={`As at ${formatDate(range.from)}`}
          />
          <SummaryTile
            label="Total cash in"
            value={formatMoney(statement.totalIn, currency)}
            tone="positive"
            sub={range.label}
          />
          <SummaryTile
            label="Total cash out"
            value={formatMoney(statement.totalOut, currency)}
            tone="negative"
            sub={range.label}
          />
          <SummaryTile
            label="Closing balance"
            value={formatMoney(statement.closingBalance, currency)}
            tone={statement.closingBalance >= 0n ? "positive" : "negative"}
            sub={`${statement.netMovement >= 0n ? "Up" : "Down"} ${formatMoney(
              statement.netMovement < 0n ? -statement.netMovement : statement.netMovement,
              currency,
            )} over the period`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Cash in"
              description="Everything that increased your balance"
              action={
                <span className="tabular text-[15px] font-semibold text-positive">
                  {formatMoney(statement.totalIn, currency)}
                </span>
              }
            />
            <CardBody className="p-0 sm:p-0">
              {statement.cashIn.length === 0 ? (
                <p className="px-5 py-10 text-center text-[13px] text-muted">
                  No money came in during this period.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {statement.cashIn.map((row) => (
                    <li
                      key={row.label}
                      className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
                    >
                      <ArrowDownLeft className="h-4 w-4 shrink-0 text-positive" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] text-foreground">{row.label}</p>
                        {row.detail && (
                          <p className="text-[12px] text-muted">{row.detail}</p>
                        )}
                      </div>
                      <p className="tabular shrink-0 text-[13.5px] font-medium">
                        {formatMoney(row.amount, currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Cash out"
              description="Everything that reduced your balance"
              action={
                <span className="tabular text-[15px] font-semibold text-negative">
                  {formatMoney(statement.totalOut, currency)}
                </span>
              }
            />
            <CardBody className="p-0 sm:p-0">
              {statement.cashOut.length === 0 ? (
                <p className="px-5 py-10 text-center text-[13px] text-muted">
                  No money went out during this period.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {statement.cashOut.map((row) => (
                    <li key={row.label} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-negative" aria-hidden />
                      <p className="min-w-0 flex-1 text-[13.5px] text-foreground">{row.label}</p>
                      <p className="tabular shrink-0 text-[13.5px] font-medium">
                        {formatMoney(row.amount, currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardBody>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13.5px]">
                <Figure label="Opening" value={formatMoney(statement.openingBalance, currency)} />
                <Operator>+</Operator>
                <Figure label="In" value={formatMoney(statement.totalIn, currency)} tone="positive" />
                <Operator>−</Operator>
                <Figure label="Out" value={formatMoney(statement.totalOut, currency)} tone="negative" />
                <Operator>=</Operator>
                <Figure
                  label="Closing"
                  value={formatMoney(statement.closingBalance, currency)}
                  emphasis
                  tone={statement.closingBalance >= 0n ? "positive" : "negative"}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Cash movement over time" description={range.label} />
          <CardBody>
            <CashFlowChart data={points} currency={currency} height={280} />
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader
              title="Cash accounts"
              description="Opening balances the statement starts from"
            />
            <CashAccountsPanel
              accounts={accounts}
              baseCurrency={currency}
              totalOpeningFormatted={formatMoney(totalOpening, currency)}
            />
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Manual cash movements"
              description="Capital, drawings, loans and other income — anything not already a sale, expense or purchase"
            />
            <TableWrap>
              <THead>
                <TH>Date</TH>
                <TH>Description</TH>
                <TH>Type</TH>
                <TH>Account</TH>
                <TH>Direction</TH>
                <TH align="right">Amount</TH>
                <TH width="52px" />
              </THead>
              <tbody>
                {entries.length === 0 ? (
                  <TableEmpty
                    colSpan={7}
                    title="No manual movements in this period"
                    description="Sales, expenses, purchases and ad spend already flow into the statement above. Record anything else here."
                    action={<AddCashEntryButton accounts={accounts} baseCurrency={currency} />}
                  />
                ) : (
                  entries.map((entry) => (
                    <CashEntryRow
                      key={entry.id}
                      entry={entry}
                      accounts={accounts}
                      baseCurrency={currency}
                    />
                  ))
                )}
              </tbody>
            </TableWrap>
          </Card>
        </div>

        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          The opening balance is calculated, not stored: it is the sum of your account opening
          balances plus every movement recorded before {formatDate(range.from)}. Change a past
          transaction and this figure follows automatically.
        </p>
      </PageBody>
    </>
  );
}

function Figure({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  emphasis?: boolean;
}) {
  return (
    <span className="flex flex-col">
      <span className="text-[11.5px] font-medium tracking-wide text-muted uppercase">{label}</span>
      <span
        className={cn(
          "tabular font-semibold",
          emphasis ? "text-[19px]" : "text-[15px]",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          !tone && "text-foreground",
        )}
      >
        {value}
      </span>
    </span>
  );
}

function Operator({ children }: { children: React.ReactNode }) {
  return <span className="text-[18px] font-light text-subtle" aria-hidden>{children}</span>;
}
