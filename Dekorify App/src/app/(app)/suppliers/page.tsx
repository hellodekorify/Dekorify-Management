import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/dates";
import { sumMoney, toDecimalString } from "@/lib/money";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { SearchInput, FilterBar, ClearFiltersButton } from "@/components/filters/table-filters";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryTile } from "@/components/ui/summary-tile";
import { ExportMenu, type ExportPayload } from "@/components/export-menu";
import { AddSupplierButton, SupplierCard, type SupplierCardData } from "./suppliers-client";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { store } = await requireContext();
  const { q } = await searchParams;
  const search = (q ?? "").trim();

  const suppliers = await prisma.supplier.findMany({
    where: {
      storeId: store.id,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { contactName: { contains: search } },
              { email: { contains: search } },
              { city: { contains: search } },
            ],
          }
        : {}),
    },
    include: {
      products: { where: { deletedAt: null }, select: { name: true } },
      cogsEntries: {
        where: { deletedAt: null },
        select: { baseTotalCostMinor: true, date: true },
      },
      expenses: { where: { deletedAt: null }, select: { baseAmountMinor: true } },
      payments: {
        where: { deletedAt: null },
        select: { baseAmountMinor: true, date: true },
        orderBy: { date: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const currency = store.baseCurrency;

  const cards: SupplierCardData[] = suppliers.map((supplier) => {
    const purchases =
      sumMoney(supplier.cogsEntries.map((entry) => entry.baseTotalCostMinor)) +
      sumMoney(supplier.expenses.map((expense) => expense.baseAmountMinor)) +
      supplier.openingBalanceMinor;
    const paid = sumMoney(supplier.payments.map((payment) => payment.baseAmountMinor));
    const outstanding = purchases - paid;

    const lastPurchaseDate = supplier.cogsEntries.reduce<Date | null>(
      (latest, entry) => (latest === null || entry.date > latest ? entry.date : latest),
      null,
    );

    return {
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      city: supplier.city,
      country: supplier.country,
      notes: supplier.notes,
      openingBalanceInput: toDecimalString(supplier.openingBalanceMinor),
      productCount: supplier.products.length,
      productNames: supplier.products.slice(0, 4).map((product) => product.name),
      totalPurchasesFormatted: formatMoney(purchases, currency),
      totalPaidFormatted: formatMoney(paid, currency),
      outstandingFormatted: formatMoney(outstanding, currency),
      outstandingIsDue: outstanding > 0n,
      lastPurchase: lastPurchaseDate ? formatDate(lastPurchaseDate) : null,
      lastPayment: supplier.payments[0] ? formatDate(supplier.payments[0].date) : null,
    };
  });

  const totalPurchases = suppliers.reduce(
    (sum, supplier) =>
      sum +
      sumMoney(supplier.cogsEntries.map((entry) => entry.baseTotalCostMinor)) +
      sumMoney(supplier.expenses.map((expense) => expense.baseAmountMinor)) +
      supplier.openingBalanceMinor,
    0n,
  );
  const totalPaid = suppliers.reduce(
    (sum, supplier) => sum + sumMoney(supplier.payments.map((payment) => payment.baseAmountMinor)),
    0n,
  );
  const totalOutstanding = totalPurchases - totalPaid;
  const owing = cards.filter((card) => card.outstandingIsDue).length;

  const exportPayload: ExportPayload = {
    title: `Suppliers — ${store.name}`,
    columns: [
      "Supplier",
      "Contact",
      "Email",
      "Phone",
      "City",
      "Products",
      `Purchased (${currency})`,
      `Paid (${currency})`,
      `Outstanding (${currency})`,
    ],
    numericColumns: [5, 6, 7, 8],
    rows: cards.map((card) => [
      card.name,
      card.contactName ?? "",
      card.email ?? "",
      card.phone ?? "",
      [card.city, card.country].filter(Boolean).join(", "),
      card.productCount,
      card.totalPurchasesFormatted.replace(/^[A-Z]{3} /, ""),
      card.totalPaidFormatted.replace(/^[A-Z]{3} /, ""),
      card.outstandingFormatted.replace(/^[A-Z]{3} /, ""),
    ]),
  };

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who you buy from, what you have bought, what you have paid and what is still owed."
        actions={
          <>
            <ExportMenu payload={exportPayload} />
            <AddSupplierButton />
          </>
        }
        filters={
          <FilterBar>
            <SearchInput placeholder="Search supplier, contact or city…" />
            <ClearFiltersButton keep={[]} />
          </FilterBar>
        }
      />

      <PageBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            label="Suppliers"
            value={suppliers.length.toLocaleString()}
            sub={owing > 0 ? `${owing} with a balance due` : "Nothing outstanding"}
          />
          <SummaryTile
            label="Total purchased"
            value={formatMoney(totalPurchases, currency)}
            sub="Stock purchases plus linked expenses"
          />
          <SummaryTile
            label="Total paid"
            value={formatMoney(totalPaid, currency)}
            sub="Payments recorded against suppliers"
          />
          <SummaryTile
            label="Outstanding"
            value={formatMoney(totalOutstanding, currency)}
            tone={totalOutstanding > 0n ? "negative" : "positive"}
            sub={totalOutstanding > 0n ? "Still owed to suppliers" : "All settled"}
          />
        </div>

        {cards.length === 0 ? (
          <Card>
            <EmptyState
              icon={Truck}
              title={search ? "No suppliers match that search" : "No suppliers yet"}
              description={
                search
                  ? "Try a different name, or clear the search to see everyone."
                  : "Add the vendors you buy stock from. Purchases recorded against them build up a payment history and running balance automatically."
              }
              action={search ? undefined : <AddSupplierButton />}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} baseCurrency={currency} />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
