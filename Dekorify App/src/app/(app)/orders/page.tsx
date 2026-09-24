import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ExternalLink, PackageSearch } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { resolveDateRange, formatDate, type DatePreset } from "@/lib/dates";
import { formatMoney } from "@/lib/currency";
import { makeLinkBuilders } from "@/lib/list-params";
import {
  ORDER_LIST_INCLUDE,
  ORDER_SORTS,
  ORDER_SORT_OPTIONS,
  bucketCounts,
  buildOrderWhere,
  orderCities,
} from "@/lib/orders/queries";
import { trackingUrlFor } from "@/lib/leopards/courier";
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
import { Pagination } from "@/components/ui/pagination";
import { TableEmpty, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { ORDER_STATUSES } from "@/lib/orders/statuses";
import { SyncTrackingButton } from "./orders-client";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 25;

const TONE_CARD: Record<string, string> = {
  neutral: "border-border-subtle hover:border-border-strong",
  info: "border-info-border bg-info-soft/40 hover:bg-info-soft",
  brand: "border-brand-border bg-brand-soft/40 hover:bg-brand-soft",
  warning: "border-warning-border bg-warning-soft/40 hover:bg-warning-soft",
  negative: "border-negative-border bg-negative-soft/40 hover:bg-negative-soft",
  positive: "border-positive-border bg-positive-soft/40 hover:bg-positive-soft",
};

const TONE_TEXT: Record<string, string> = {
  neutral: "text-foreground",
  info: "text-info",
  brand: "text-brand",
  warning: "text-warning",
  negative: "text-negative",
  positive: "text-positive",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { store } = await requireContext();
  const raw = await searchParams;

  const range = resolveDateRange((raw.range as DatePreset) ?? "last_30_days", raw.from, raw.to);
  const page = Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1);
  const sort = raw.sort && ORDER_SORTS[raw.sort] ? raw.sort : "newest";
  const links = makeLinkBuilders("/orders", raw);

  // Searching looks across all time. "Where is order #1042?" must find it
  // whenever it was placed — a search that silently obeys the date filter just
  // looks broken.
  const searching = Boolean(raw.q?.trim());

  const where = buildOrderWhere(store.id, {
    search: raw.q,
    bucket: raw.bucket,
    status: raw.status,
    courierId: raw.courier,
    city: raw.city,
    paymentStatus: raw.payment,
    paymentMethod: raw.method,
    attempts: raw.attempts,
    from: searching ? undefined : range.from,
    to: searching ? undefined : range.to,
  });

  const [orders, total, counts, cities, couriers] = await Promise.all([
    prisma.order.findMany({
      where,
      include: ORDER_LIST_INCLUDE,
      orderBy: ORDER_SORTS[sort],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where }),
    bucketCounts(store.id, range),
    orderCities(store.id),
    prisma.courier.findMany({
      where: { storeId: store.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const currency = store.baseCurrency;
  const activeBucket = raw.bucket ?? null;

  const bucketHref = (key: string | null) => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(raw)) {
      if (value && name !== "bucket" && name !== "page") params.set(name, value);
    }
    if (key) params.set("bucket", key);
    const query = params.toString();
    return `/orders${query ? `?${query}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order from the moment it is placed until the parcel stops moving."
        actions={
          <>
            {counts.issues > 0 && (
              <LinkButton href="/orders/issues" variant="secondary" className="gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                {counts.issues} need attention
              </LinkButton>
            )}
            <DateRangeFilter label={range.label} />
            <SyncTrackingButton />
          </>
        }
        filters={
          <FilterBar>
            <SearchInput placeholder="Order #, customer, phone or CN number…" />
            <FilterSelect
              param="status"
              label="Status"
              allLabel="Any status"
              options={ORDER_STATUSES.map((status) => ({
                value: status.value,
                label: status.label,
              }))}
            />
            <FilterSelect
              param="city"
              label="City"
              allLabel="All cities"
              options={cities.map((city) => ({ value: city, label: city }))}
            />
            <FilterSelect
              param="courier"
              label="Courier"
              allLabel="All couriers"
              options={couriers.map((courier) => ({ value: courier.id, label: courier.name }))}
            />
            <FilterSelect
              param="method"
              label="Payment"
              allLabel="Any payment"
              options={[
                { value: "COD", label: "Cash on delivery" },
                { value: "PREPAID", label: "Prepaid" },
              ]}
            />
            <FilterSelect
              param="attempts"
              label="Attempts"
              allLabel="Any attempts"
              options={[
                { value: "0", label: "No attempts" },
                { value: "1", label: "1 attempt" },
                { value: "2+", label: "2 or more" },
                { value: "3+", label: "3 or more" },
              ]}
            />
            <FilterSelect
              param="sort"
              label="Sort"
              allLabel="Newest first"
              options={ORDER_SORT_OPTIONS.filter((option) => option.value !== "newest")}
            />
            <ClearFiltersButton />
          </FilterBar>
        }
      />

      <PageBody className="space-y-4">
        {searching && (
          <p className="rounded-lg border border-info-border bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
            Showing <span className="font-semibold">{total.toLocaleString()}</span> result
            {total === 1 ? "" : "s"} for “{raw.q}” across all dates — search ignores the date
            filter so an older order is never hidden from you.
          </p>
        )}

        {/* Status cards — clicking one filters the table below. */}
        <section aria-label="Orders by status">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
            <Link
              href={bucketHref(null)}
              className={cn(
                "rounded-xl border bg-surface px-3.5 py-3 transition-colors",
                activeBucket === null
                  ? "border-brand ring-1 ring-brand"
                  : "border-border-subtle hover:border-border-strong",
              )}
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <p className="text-[12px] font-medium text-muted">All orders</p>
              <p className="tabular mt-0.5 text-[20px] font-semibold tracking-[-0.02em]">
                {counts.total.toLocaleString()}
              </p>
            </Link>

            {counts.buckets
              .filter((bucket) => bucket.count > 0 || activeBucket === bucket.key)
              .map((bucket) => (
                <Link
                  key={bucket.key}
                  href={bucketHref(bucket.key)}
                  className={cn(
                    "rounded-xl border bg-surface px-3.5 py-3 transition-colors",
                    TONE_CARD[bucket.tone],
                    activeBucket === bucket.key && "ring-1 ring-brand border-brand",
                  )}
                  style={{ boxShadow: "var(--shadow-sm)" }}
                >
                  <p className="truncate text-[12px] font-medium text-muted">{bucket.label}</p>
                  <p
                    className={cn(
                      "tabular mt-0.5 text-[20px] font-semibold tracking-[-0.02em]",
                      TONE_TEXT[bucket.tone],
                    )}
                  >
                    {bucket.count.toLocaleString()}
                  </p>
                </Link>
              ))}
          </div>
        </section>

        <Card className="overflow-hidden">
          <TableWrap>
            <THead>
              <TH>Order</TH>
              <TH>Customer</TH>
              <TH>City</TH>
              <TH>Products</TH>
              <TH align="right">Value</TH>
              <TH>Payment</TH>
              <TH>Tracking</TH>
              <TH>Status</TH>
              <TH align="right">Attempts</TH>
              <TH>Last update</TH>
              <TH width="52px" />
            </THead>

            <tbody>
              {orders.length === 0 ? (
                <TableEmpty
                  colSpan={11}
                  title="No orders match these filters"
                  description="Connect Shopify and run a sync, or widen the date range."
                  action={
                    <LinkButton href="/settings/shopify" variant="primary">
                      Connect Shopify
                    </LinkButton>
                  }
                />
              ) : (
                orders.map((order) => {
                  const shipment = order.shipments[0];
                  const trackingUrl = trackingUrlFor(
                    shipment?.courier ?? null,
                    shipment?.trackingNumber ?? null,
                  );
                  const productSummary =
                    order.items.length === 0
                      ? "—"
                      : order.items.length === 1
                        ? `${order.items[0].title}${order.items[0].quantity > 1 ? ` × ${order.items[0].quantity}` : ""}`
                        : `${order.items[0].title} +${order.items.length - 1} more`;

                  return (
                    <TR key={order.id}>
                      <TD>
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-medium text-foreground hover:text-brand hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <p className="mt-0.5 text-[12px] text-muted">{formatDate(order.placedAt)}</p>
                      </TD>
                      <TD>
                        <span className="text-[13px]">{order.customerName ?? "—"}</span>
                        {order.customerPhone && (
                          <p className="tabular mt-0.5 text-[12px] text-muted">
                            {order.customerPhone}
                          </p>
                        )}
                      </TD>
                      <TD className="text-[13px] text-muted-strong">{order.city ?? "—"}</TD>
                      <TD className="max-w-[220px]">
                        <span className="block truncate text-[13px]" title={productSummary}>
                          {productSummary}
                        </span>
                      </TD>
                      <TD numeric align="right" className="font-medium">
                        {formatMoney(order.totalMinor, order.currency || currency)}
                      </TD>
                      <TD>
                        <span className="text-[12.5px] text-muted-strong">
                          {order.paymentMethod === "PREPAID" ? "Prepaid" : "COD"}
                        </span>
                        {order.paymentStatus && (
                          <p className="text-[11.5px] text-muted">{order.paymentStatus}</p>
                        )}
                      </TD>
                      <TD>
                        {shipment?.trackingNumber ? (
                          trackingUrl ? (
                            <a
                              href={trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tabular inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline"
                            >
                              {shipment.trackingNumber}
                              <ExternalLink className="h-3 w-3" aria-hidden />
                            </a>
                          ) : (
                            <span className="tabular text-[12.5px]">{shipment.trackingNumber}</span>
                          )
                        ) : (
                          <span className="text-[12.5px] text-subtle">Not booked</span>
                        )}
                        {shipment?.courier && (
                          <p className="text-[11.5px] text-muted">{shipment.courier.name}</p>
                        )}
                      </TD>
                      <TD>
                        <OrderStatusBadge status={order.status} />
                        {order.currentLocation && (
                          <p className="mt-0.5 text-[11.5px] text-muted">{order.currentLocation}</p>
                        )}
                      </TD>
                      <TD numeric align="right">
                        <span
                          className={cn(
                            order.deliveryAttempts >= 2 && "font-semibold text-negative",
                          )}
                        >
                          {order.deliveryAttempts}
                        </span>
                      </TD>
                      <TD className="text-[12.5px] text-muted-strong">
                        {order.lastTrackingAt ? relativeTime(order.lastTrackingAt) : "—"}
                      </TD>
                      <TD align="right">
                        <Link
                          href={`/orders/${order.id}`}
                          className="inline-flex items-center rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                          aria-label={`Open ${order.orderNumber}`}
                        >
                          <PackageSearch className="h-4 w-4" aria-hidden />
                        </Link>
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </TableWrap>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            hrefFor={links.pageHref}
          />
        </Card>
      </PageBody>
    </>
  );
}

/** "2h ago" reads faster than a timestamp when scanning a list. */
function relativeTime(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days <= 14) return `${days}d ago`;

  return formatDate(date);
}
