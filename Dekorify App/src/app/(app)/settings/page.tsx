import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { Card, CardHeader } from "@/components/ui/card";
import { StoreSettingsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Business settings" };

export default async function BusinessSettingsPage() {
  const { store } = await requireContext();

  const [full, counts] = await Promise.all([
    prisma.store.findUniqueOrThrow({ where: { id: store.id } }),
    Promise.all([
      prisma.sale.count({ where: { storeId: store.id, deletedAt: null } }),
      prisma.expense.count({ where: { storeId: store.id, deletedAt: null } }),
      prisma.cogsEntry.count({ where: { storeId: store.id, deletedAt: null } }),
      prisma.adSpend.count({ where: { storeId: store.id, deletedAt: null } }),
      prisma.product.count({ where: { storeId: store.id, deletedAt: null } }),
      prisma.supplier.count({ where: { storeId: store.id, deletedAt: null } }),
    ]),
  ]);

  const [sales, expenses, cogs, ads, products, suppliers] = counts;

  return (
    <>
      <Card>
        <CardHeader
          title="Business details"
          description="How this store is named and which currency its reports use."
        />
        <StoreSettingsForm
          store={{
            name: full.name,
            baseCurrency: full.baseCurrency,
            timezone: full.timezone,
          }}
        />
      </Card>

      <Card>
        <CardHeader
          title="What is in this store"
          description={`Created ${formatDate(full.createdAt)}`}
        />
        <dl className="grid grid-cols-2 divide-x divide-y divide-border-subtle sm:grid-cols-3">
          {[
            { label: "Sales", value: sales },
            { label: "Expenses", value: expenses },
            { label: "COGS entries", value: cogs },
            { label: "Ad spend entries", value: ads },
            { label: "Products", value: products },
            { label: "Suppliers", value: suppliers },
          ].map((item) => (
            <div key={item.label} className="px-4 py-4">
              <dt className="text-[12px] font-medium text-muted">{item.label}</dt>
              <dd className="tabular mt-0.5 text-[18px] font-semibold text-foreground">
                {item.value.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
