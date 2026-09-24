import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/dates";
import { trackingUrlFor } from "@/lib/leopards/courier";
import { statusDef } from "@/lib/orders/statuses";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { TrackingTimeline } from "@/components/orders/timeline";
import { OrderActionBar } from "./order-actions";
import { BookShipmentButton } from "../orders-client";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderId: string }>;
}): Promise<Metadata> {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true },
  });
  return { title: order ? `Order ${order.orderNumber}` : "Order" };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { store } = await requireContext();
  const { orderId } = await params;

  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id, deletedAt: null },
    include: {
      items: true,
      orderNotes: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      shipments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          courier: true,
          attempts: { orderBy: { attemptNumber: "asc" } },
          events: {
            orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
            include: { user: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!order) notFound();

  const couriers = await prisma.courier.findMany({
    where: { storeId: store.id, deletedAt: null },
    select: { id: true, name: true, originCityId: true },
    orderBy: { name: "asc" },
  });

  const shipment = order.shipments[order.shipments.length - 1] ?? null;
  const trackingUrl = trackingUrlFor(shipment?.courier ?? null, shipment?.trackingNumber ?? null);
  const definition = statusDef(order.status);
  const currency = order.currency || store.baseCurrency;

  const events = order.shipments.flatMap((entry) =>
    entry.events.map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt,
      source: event.source,
      internalStatus: event.internalStatus,
      courierStatus: event.courierStatus,
      location: event.location,
      description: event.description,
      notes: event.notes,
      userName: event.user?.name ?? null,
    })),
  );
  events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const attempts = order.shipments.flatMap((entry) => entry.attempts);

  // What blocks a booking, said plainly rather than as a courier error later.
  const blockers: string[] = [];
  if (!order.customerPhone) blockers.push("customer phone");
  if (!order.address1) blockers.push("address");
  if (!order.city) blockers.push("city");
  if (!couriers.some((courier) => courier.originCityId)) blockers.push("origin city in settings");

  return (
    <>
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={`Placed ${formatDate(order.placedAt)}${order.customerName ? ` · ${order.customerName}` : ""}`}
        actions={
          <>
            <LinkButton href="/orders" className="gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All orders
            </LinkButton>
            {order.shopifyOrderGid && store.shopifyDomain && (
              <LinkButton
                href={`https://${store.shopifyDomain}/admin/orders/${order.shopifyOrderId ?? ""}`}
                className="gap-2"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden />
                Open in Shopify
              </LinkButton>
            )}
          </>
        }
      />

      <PageBody className="space-y-4">
        {/* Where is this order right now — the question the page exists for. */}
        <section
          className={cn(
            "overflow-hidden rounded-2xl border",
            definition.tone === "positive" && "border-positive-border bg-positive-soft",
            definition.tone === "negative" && "border-negative-border bg-negative-soft",
            definition.tone === "warning" && "border-warning-border bg-warning-soft",
            (definition.tone === "info" ||
              definition.tone === "brand" ||
              definition.tone === "neutral") &&
              "border-border-subtle bg-surface",
          )}
          style={{ boxShadow: "var(--shadow-md)" }}
          aria-label="Current status"
        >
          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold tracking-wider text-muted uppercase">
                  Current status
                </p>
                <p
                  className={cn(
                    "mt-1.5 text-[26px] leading-tight font-semibold tracking-[-0.02em] sm:text-[30px]",
                    definition.tone === "positive" && "text-positive",
                    definition.tone === "negative" && "text-negative",
                    definition.tone === "warning" && "text-warning",
                    (definition.tone === "info" ||
                      definition.tone === "brand" ||
                      definition.tone === "neutral") &&
                      "text-foreground",
                  )}
                >
                  {definition.label}
                </p>
                <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted-strong">
                  {definition.description}
                </p>
              </div>

              {!shipment?.trackingNumber && order.status !== "CANCELLED" && (
                <BookShipmentButton
                  orderId={order.id}
                  disabled={blockers.length > 0}
                  reason={
                    blockers.length > 0 ? `Cannot book yet — missing ${blockers.join(", ")}.` : undefined
                  }
                />
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-black/5 pt-4 sm:grid-cols-3 lg:grid-cols-6">
              <Fact label="Courier" value={shipment?.courier?.name ?? "Not booked"} />
              <Fact
                label="CN number"
                value={
                  shipment?.trackingNumber ? (
                    trackingUrl ? (
                      <a
                        href={trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand hover:underline"
                      >
                        {shipment.trackingNumber}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : (
                      shipment.trackingNumber
                    )
                  ) : (
                    "—"
                  )
                }
              />
              <Fact label="Location" value={order.currentLocation ?? "—"} />
              <Fact
                label="Last update"
                value={order.lastTrackingAt ? formatDateTime(order.lastTrackingAt) : "—"}
              />
              <Fact
                label="Attempts"
                value={String(order.deliveryAttempts)}
                tone={order.deliveryAttempts >= 2 ? "negative" : undefined}
              />
              <Fact
                label="Expected"
                value={order.expectedDeliveryAt ? formatDate(order.expectedDeliveryAt) : "—"}
              />
            </dl>

            <div className="border-t border-black/5 pt-4">
              <OrderActionBar
                orderId={order.id}
                currentStatus={order.status}
                hasTracking={Boolean(shipment?.trackingNumber)}
                couriers={couriers.map((courier) => ({ id: courier.id, name: courier.name }))}
              />
            </div>
          </div>
        </section>

        {order.hasIssue && order.issueReason && (
          <div className="rounded-xl border border-warning-border bg-warning-soft p-4">
            <p className="text-[13.5px] font-semibold text-warning">This order needs attention</p>
            <p className="mt-1 text-[13px] leading-relaxed text-warning">{order.issueReason}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <CardHeader
                title="Tracking timeline"
                description="Every event, oldest first. Courier wording is kept exactly as received."
              />
              <TrackingTimeline events={events} />
            </Card>

            {attempts.length > 0 && (
              <Card className="overflow-hidden">
                <CardHeader
                  title="Delivery attempts"
                  description="Derived automatically from the tracking events above."
                />
                <ul className="divide-y divide-border-subtle">
                  {attempts.map((attempt) => (
                    <li key={attempt.id} className="flex items-start gap-3.5 px-4 py-3 sm:px-5">
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                          attempt.outcome === "DELIVERED"
                            ? "bg-positive-soft text-positive"
                            : "bg-negative-soft text-negative",
                        )}
                      >
                        {attempt.attemptNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] font-medium">
                          Attempt {attempt.attemptNumber}
                          <Badge tone={attempt.outcome === "DELIVERED" ? "positive" : "negative"}>
                            {attempt.outcome === "DELIVERED" ? "Delivered" : "Failed"}
                          </Badge>
                          <span className="tabular text-[12px] font-normal text-muted">
                            {formatDateTime(attempt.attemptedAt)}
                          </span>
                        </p>
                        {attempt.reason && (
                          <p className="mt-0.5 text-[12.5px] text-muted-strong">
                            Reason: {attempt.reason}
                          </p>
                        )}
                        {attempt.courierRemarks && (
                          <p className="mt-0.5 text-[12.5px] text-muted">{attempt.courierRemarks}</p>
                        )}
                        {attempt.nextAction && (
                          <p className="mt-1 text-[12.5px] font-medium text-warning">
                            Next: {attempt.nextAction}
                          </p>
                        )}
                      </div>
                      {attempt.location && (
                        <span className="shrink-0 text-[12px] text-muted">{attempt.location}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card className="overflow-hidden">
              <CardHeader title="Products" description={`${order.items.length} line${order.items.length === 1 ? "" : "s"}`} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead className="border-b border-border-subtle bg-surface-muted">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[12px] font-semibold tracking-wide text-muted-strong uppercase">
                        Product
                      </th>
                      <th className="px-4 py-2.5 text-left text-[12px] font-semibold tracking-wide text-muted-strong uppercase">
                        SKU
                      </th>
                      <th className="px-4 py-2.5 text-right text-[12px] font-semibold tracking-wide text-muted-strong uppercase">
                        Qty
                      </th>
                      <th className="px-4 py-2.5 text-right text-[12px] font-semibold tracking-wide text-muted-strong uppercase">
                        Price
                      </th>
                      <th className="px-4 py-2.5 text-right text-[12px] font-semibold tracking-wide text-muted-strong uppercase">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-4 py-2.5">
                          {item.title}
                          {item.variant && (
                            <span className="ml-1.5 text-[12px] text-muted">{item.variant}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12.5px] text-muted-strong">
                          {item.sku ?? "—"}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right">{item.quantity}</td>
                        <td className="tabular px-4 py-2.5 text-right text-muted-strong">
                          {formatMoney(item.unitPriceMinor, currency)}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right font-medium">
                          {formatMoney(item.totalMinor, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border-strong bg-surface-muted">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-right text-[13px] text-muted-strong">
                        Subtotal
                      </td>
                      <td className="tabular px-4 py-2.5 text-right">
                        {formatMoney(order.subtotalMinor, currency)}
                      </td>
                    </tr>
                    {order.discountMinor > 0n && (
                      <tr>
                        <td colSpan={4} className="px-4 py-2.5 text-right text-[13px] text-muted-strong">
                          Discount
                        </td>
                        <td className="tabular px-4 py-2.5 text-right">
                          ({formatMoney(order.discountMinor, currency)})
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-right text-[13px] text-muted-strong">
                        Shipping
                      </td>
                      <td className="tabular px-4 py-2.5 text-right">
                        {formatMoney(order.shippingMinor, currency)}
                      </td>
                    </tr>
                    <tr className="border-t border-border-strong">
                      <td colSpan={4} className="px-4 py-3 text-right text-[14px] font-semibold">
                        Order total
                      </td>
                      <td className="tabular px-4 py-3 text-right text-[15px] font-semibold">
                        {formatMoney(order.totalMinor, currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Customer" />
              <CardBody className="space-y-3 text-[13.5px]">
                <p className="font-medium">{order.customerName ?? "Not recorded"}</p>

                {order.customerPhone && (
                  <p className="flex items-center gap-2 text-muted-strong">
                    <Phone className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <a href={`tel:${order.customerPhone}`} className="tabular hover:text-brand hover:underline">
                      {order.customerPhone}
                    </a>
                  </p>
                )}
                {order.customerEmail && (
                  <p className="flex items-center gap-2 text-muted-strong">
                    <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <a
                      href={`mailto:${order.customerEmail}`}
                      className="truncate hover:text-brand hover:underline"
                    >
                      {order.customerEmail}
                    </a>
                  </p>
                )}
                {(order.address1 || order.city) && (
                  <p className="flex items-start gap-2 text-muted-strong">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span className="leading-relaxed">
                      {[order.address1, order.address2, order.city, order.province, order.postalCode]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Order & payment" />
              <CardBody>
                <dl className="space-y-2.5 text-[13px]">
                  <Row label="Order number" value={order.orderNumber} />
                  <Row label="Shopify ID" value={order.shopifyOrderId ?? "—"} />
                  <Row label="Placed" value={formatDateTime(order.placedAt)} />
                  <Row
                    label="Payment"
                    value={order.paymentMethod === "PREPAID" ? "Prepaid" : "Cash on delivery"}
                  />
                  <Row label="Payment status" value={order.paymentStatus ?? "—"} />
                  <Row label="Order value" value={formatMoney(order.totalMinor, currency)} />
                  {order.tags && <Row label="Tags" value={order.tags} />}
                </dl>
              </CardBody>
            </Card>

            {shipment && (
              <Card>
                <CardHeader
                  title="Shipment"
                  action={<OrderStatusBadge status={shipment.status} size="sm" />}
                />
                <CardBody>
                  <dl className="space-y-2.5 text-[13px]">
                    <Row label="Courier" value={shipment.courier?.name ?? "—"} />
                    <Row label="CN number" value={shipment.trackingNumber ?? "—"} />
                    <Row
                      label="Courier status"
                      value={shipment.courierStatus ?? "—"}
                    />
                    <Row label="Booked" value={shipment.bookedAt ? formatDateTime(shipment.bookedAt) : "—"} />
                    <Row
                      label="Picked up"
                      value={shipment.pickedUpAt ? formatDateTime(shipment.pickedUpAt) : "—"}
                    />
                    <Row
                      label="Delivered"
                      value={shipment.deliveredAt ? formatDateTime(shipment.deliveredAt) : "—"}
                    />
                    <Row label="Pieces" value={String(shipment.pieces)} />
                    <Row
                      label="Weight"
                      value={shipment.weightGrams ? `${shipment.weightGrams} g` : "—"}
                    />
                    <Row
                      label="COD to collect"
                      value={
                        shipment.codAmountMinor > 0n
                          ? formatMoney(shipment.codAmountMinor, currency)
                          : "Prepaid"
                      }
                    />
                  </dl>

                  {order.shipments.length > 1 && (
                    <p className="mt-3 flex items-center gap-2 border-t border-border-subtle pt-3 text-[12.5px] text-muted">
                      <Truck className="h-3.5 w-3.5" aria-hidden />
                      This order has {order.shipments.length} shipments.
                    </p>
                  )}
                </CardBody>
              </Card>
            )}

            <Card className="overflow-hidden">
              <CardHeader title="Notes" description={`${order.orderNotes.length} recorded`} />
              {order.orderNotes.length === 0 ? (
                <CardBody>
                  <p className="text-[13px] text-muted">
                    Nothing noted yet. Use “Add note” above to record a call or a decision.
                  </p>
                </CardBody>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {order.orderNotes.map((note) => (
                    <li key={note.id} className="px-4 py-3 sm:px-5">
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            note.kind === "ISSUE"
                              ? "warning"
                              : note.kind === "RESOLUTION"
                                ? "positive"
                                : "neutral"
                          }
                        >
                          {note.kind.toLowerCase()}
                        </Badge>
                        <span className="text-[11.5px] text-muted">
                          {note.user?.name ?? "System"} · {formatDateTime(note.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-strong">
                        {note.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {order.saleId && (
              <Link
                href="/sales"
                className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface px-4 py-3 text-[13px] transition-colors hover:bg-surface-muted"
                style={{ boxShadow: "var(--shadow-sm)" }}
              >
                <span className="text-muted-strong">Linked finance record</span>
                <span className="font-medium text-brand">View in Sales →</span>
              </Link>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "negative";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd
        className={cn(
          "tabular mt-0.5 truncate text-[13.5px] font-medium",
          tone === "negative" ? "text-negative" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
