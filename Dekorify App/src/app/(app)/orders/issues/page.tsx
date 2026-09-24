import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Phone } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { resolveDateRange, formatDate, type DatePreset } from "@/lib/dates";
import { formatMoney } from "@/lib/currency";
import { makeLinkBuilders } from "@/lib/list-params";
import { ORDER_LIST_INCLUDE, buildOrderWhere, orderCities } from "@/lib/orders/queries";
import { ISSUE_STATUSES, ORDER_STATUSES } from "@/lib/orders/statuses";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import {
  ClearFiltersButton,
  FilterBar,
  FilterSelect,
  SearchInput,
} from "@/components/filters/table-filters";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { SyncTrackingButton } from "../orders-client";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Delivery issues" };

const PAGE_SIZE = 30;

const ISSUE_OPTIONS = ORDER_STATUSES.filter((status) => status.isIssue).map((status) => ({
  value: status.value,
  label: status.label,
}));

export default async function DeliveryIssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { store } = await requireContext();
  const raw = await searchParams;

  const range = resolveDateRange((raw.range as DatePreset) ?? "last_30_days", raw.from, raw.to);
  const page = Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1);
  const links = makeLinkBuilders("/orders/issues", raw);

  // As on the main list, searching spans all dates.
  const searching = Boolean(raw.q?.trim());

  const where = buildOrderWhere(store.id, {
    search: raw.q,
    status: raw.status,
    city: raw.city,
    attempts: raw.attempts,
    from: searching ? undefined : range.from,
    to: searching ? undefined : range.to,
    issuesOnly: true,
  });

  const [orders, total, cities, byStatus] = await Promise.all([
    prisma.order.findMany({
      where,
      include: ORDER_LIST_INCLUDE,
      // Most attempts first: those are the orders bleeding money.
      orderBy: [{ deliveryAttempts: "desc" }, { lastTrackingAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where }),
    orderCities(store.id),
    prisma.order.groupBy({
      by: ["status"],
      where: {
        storeId: store.id,
        deletedAt: null,
        placedAt: { gte: range.from, lte: range.to },
        OR: [{ hasIssue: true }, { status: { in: ISSUE_STATUSES } }],
      },
      _count: { _all: true },
    }),
  ]);

  const valueAtRisk = await prisma.order.aggregate({ where, _sum: { totalMinor: true } });
  const currency = store.baseCurrency;

  return (
    <>
      <PageHeader
        title="Delivery issues"
        description="Orders the courier could not complete. These are the ones costing you money if nobody acts."
        actions={
          <>
            <LinkButton href="/orders" className="gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All orders
            </LinkButton>
            <DateRangeFilter label={range.label} />
            <SyncTrackingButton />
          </>
        }
        filters={
          <FilterBar>
            <SearchInput placeholder="Order #, customer, phone or CN…" />
            <FilterSelect
              param="status"
              label="Issue"
              allLabel="All issues"
              options={ISSUE_OPTIONS}
            />
            <FilterSelect
              param="city"
              label="City"
              allLabel="All cities"
              options={cities.map((city) => ({ value: city, label: city }))}
            />
            <FilterSelect
              param="attempts"
              label="Attempts"
              allLabel="Any attempts"
              options={[
                { value: "1", label: "1 attempt" },
                { value: "2+", label: "2 or more" },
                { value: "3+", label: "3 or more" },
              ]}
            />
            <ClearFiltersButton />
          </FilterBar>
        }
      />

      <PageBody className="space-y-4">
        {total > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-warning-border bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
              <div>
                <p className="text-[15px] font-semibold text-warning">
                  {total} order{total === 1 ? "" : "s"} need attention
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-warning">
                  {formatMoney(valueAtRisk._sum.totalMinor ?? 0n, currency)} of order value is
                  sitting undelivered.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {byStatus
                .sort((a, b) => b._count._all - a._count._all)
                .slice(0, 4)
                .map((row) => (
                  <span
                    key={row.status}
                    className="rounded-md border border-warning-border bg-surface px-2 py-1 text-[12px] font-medium text-warning"
                  >
                    {ORDER_STATUSES.find((status) => status.value === row.status)?.label ??
                      row.status}
                    : {row._count._all}
                  </span>
                ))}
            </div>
          </div>
        )}

        <Card className="overflow-hidden">
          {orders.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing needs attention"
              description="No failed deliveries, missed customers or returns in this period. Widen the date range if you are looking for something older."
              action={
                <LinkButton href="/orders" variant="primary">
                  Back to all orders
                </LinkButton>
              }
            />
          ) : (
            <>
              <TableWrap>
                <THead>
                  <TH>Order</TH>
                  <TH>Customer</TH>
                  <TH>City</TH>
                  <TH>CN</TH>
                  <TH>Issue</TH>
                  <TH align="right">Attempts</TH>
                  <TH align="right">Value</TH>
                  <TH>Last update</TH>
                  <TH>Next action</TH>
                </THead>

                <tbody>
                  {orders.map((order) => {
                    const shipment = order.shipments[0];
                    return (
                      <TR key={order.id}>
                        <TD>
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-medium hover:text-brand hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                          <p className="mt-0.5 text-[12px] text-muted">
                            {formatDate(order.placedAt)}
                          </p>
                        </TD>
                        <TD>
                          <span className="text-[13px]">{order.customerName ?? "—"}</span>
                          {order.customerPhone && (
                            <a
                              href={`tel:${order.customerPhone}`}
                              className="tabular mt-0.5 flex items-center gap-1 text-[12px] text-brand hover:underline"
                            >
                              <Phone className="h-3 w-3" aria-hidden />
                              {order.customerPhone}
                            </a>
                          )}
                        </TD>
                        <TD className="text-[13px] text-muted-strong">{order.city ?? "—"}</TD>
                        <TD className="tabular text-[12.5px] text-muted-strong">
                          {shipment?.trackingNumber ?? "—"}
                        </TD>
                        <TD>
                          <OrderStatusBadge status={order.status} />
                          {order.issueReason && order.issueReason !== order.status && (
                            <p className="mt-0.5 max-w-[220px] truncate text-[11.5px] text-muted">
                              {order.issueReason}
                            </p>
                          )}
                        </TD>
                        <TD numeric align="right">
                          <span
                            className={cn(
                              "font-semibold",
                              order.deliveryAttempts >= 3
                                ? "text-negative"
                                : order.deliveryAttempts >= 2
                                  ? "text-warning"
                                  : "text-foreground",
                            )}
                          >
                            {order.deliveryAttempts}
                          </span>
                        </TD>
                        <TD numeric align="right" className="font-medium">
                          {formatMoney(order.totalMinor, order.currency || currency)}
                        </TD>
                        <TD className="text-[12.5px] text-muted-strong">
                          {order.lastTrackingAt ? formatDate(order.lastTrackingAt) : "—"}
                        </TD>
                        <TD className="max-w-[200px] text-[12.5px] text-muted">
                          {suggestAction(order.status, order.deliveryAttempts)}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </TableWrap>

              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                hrefFor={links.pageHref}
              />
            </>
          )}
        </Card>
      </PageBody>
    </>
  );
}

/** A concrete next step beats a status the operator has to interpret. */
function suggestAction(status: string, attempts: number): string {
  if (attempts >= 3) return "Decide: reattempt or accept the return";
  switch (status) {
    case "CUSTOMER_NOT_HOME":
      return "Call and agree a delivery window";
    case "CUSTOMER_UNAVAILABLE":
      return "Try the alternate number";
    case "DELIVERY_FAILED":
      return "Confirm the address";
    case "REFUSED":
      return "Confirm the return, chase payment if prepaid";
    case "RETURN_IN_TRANSIT":
    case "RETURN_REQUESTED":
      return "Expect it back — restock on arrival";
    case "RESCHEDULED":
      return "Confirm the new date with the customer";
    default:
      return "Review with the courier";
  }
}
