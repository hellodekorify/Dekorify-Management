/**
 * Demo data for the order tracking module.
 *
 * Builds operational Orders from the existing seeded Sales, then plays a
 * realistic courier journey through the tracking engine — including failed
 * attempts, customers not at home, refusals and returns — so every screen and
 * every report has something true to show.
 *
 * Run with:  npm run db:seed:orders
 */

import { PrismaClient } from "@prisma/client";
import { addHours, addDays, startOfDay } from "date-fns";

const prisma = new PrismaClient();

const TODAY = new Date();

// Deterministic, so re-running gives the same book of orders.
let seed = 20260822;
function random(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

const CITIES = [
  { name: "Lahore", id: "789", province: "Punjab", hub: "Lahore Hub" },
  { name: "Karachi", id: "1017", province: "Sindh", hub: "Karachi Hub" },
  { name: "Islamabad", id: "790", province: "Islamabad", hub: "Islamabad Hub" },
  { name: "Rawalpindi", id: "791", province: "Punjab", hub: "Rawalpindi Hub" },
  { name: "Faisalabad", id: "802", province: "Punjab", hub: "Faisalabad Hub" },
  { name: "Multan", id: "812", province: "Punjab", hub: "Multan Hub" },
  { name: "Peshawar", id: "838", province: "KPK", hub: "Peshawar Hub" },
] as const;

const STREETS = [
  "House 214, Street 7, DHA Phase 5",
  "Flat 3B, Gulberg Heights, Main Boulevard",
  "Shop 12, Saddar Bazaar",
  "House 88, Model Town Block C",
  "Plot 45, Bahria Town Sector B",
  "House 9, Askari 11",
  "Apartment 402, Clifton Block 2",
];

/**
 * Each journey is a list of [courier status, hours after booking].
 * These are the real Leopards wordings the default mapping expects.
 */
const JOURNEYS: { weight: number; name: string; steps: [string, number][] }[] = [
  {
    weight: 46,
    name: "clean delivery",
    steps: [
      ["Consignment Booked", 0],
      ["Shipment Picked Up", 6],
      ["In Transit", 20],
      ["Arrived at Destination", 34],
      ["Out for Delivery", 44],
      ["Delivered", 50],
    ],
  },
  {
    weight: 14,
    name: "second attempt succeeds",
    steps: [
      ["Consignment Booked", 0],
      ["Shipment Picked Up", 7],
      ["In Transit", 22],
      ["Arrived at Destination", 36],
      ["Out for Delivery", 45],
      ["Customer Not Available", 52],
      ["Rescheduled", 55],
      ["Out for Delivery", 69],
      ["Delivered", 76],
    ],
  },
  {
    weight: 7,
    name: "third attempt succeeds",
    steps: [
      ["Consignment Booked", 0],
      ["Shipment Picked Up", 6],
      ["In Transit", 21],
      ["Out for Delivery", 44],
      ["Customer Not Available", 51],
      ["Out for Delivery", 68],
      ["Phone Not Responding", 74],
      ["Out for Delivery", 92],
      ["Delivered", 99],
    ],
  },
  {
    weight: 9,
    name: "returned after failures",
    steps: [
      ["Consignment Booked", 0],
      ["Shipment Picked Up", 6],
      ["In Transit", 20],
      ["Out for Delivery", 44],
      ["Customer Not Available", 50],
      ["Out for Delivery", 68],
      ["Customer Not Available", 74],
      ["Out for Delivery", 92],
      ["Delivery Failed", 98],
      ["Return to Shipper", 110],
      ["Returned to Origin", 150],
    ],
  },
  {
    weight: 4,
    name: "refused on arrival",
    steps: [
      ["Consignment Booked", 0],
      ["Shipment Picked Up", 6],
      ["In Transit", 20],
      ["Out for Delivery", 43],
      ["Refused by Customer", 48],
      ["Return to Shipper", 60],
    ],
  },
  {
    weight: 8,
    name: "still moving",
    steps: [
      ["Consignment Booked", 0],
      ["Shipment Picked Up", 6],
      ["In Transit", 20],
    ],
  },
  {
    weight: 6,
    name: "out for delivery now",
    steps: [
      ["Consignment Booked", 0],
      ["Shipment Picked Up", 6],
      ["In Transit", 20],
      ["Arrived at Destination", 34],
      ["Out for Delivery", 42],
    ],
  },
  {
    weight: 3,
    name: "stuck at hub",
    steps: [
      ["Consignment Booked", 0],
      ["Shipment Picked Up", 8],
      ["In Transit", 24],
      ["Arrived at Destination", 40],
      ["Incorrect Address", 50],
    ],
  },
  {
    weight: 3,
    name: "not booked yet",
    steps: [],
  },
];

function pickJourney() {
  const total = JOURNEYS.reduce((sum, journey) => sum + journey.weight, 0);
  let ticket = random() * total;
  for (const journey of JOURNEYS) {
    ticket -= journey.weight;
    if (ticket <= 0) return journey;
  }
  return JOURNEYS[0];
}

async function main() {
  console.log("Seeding order tracking demo data...\n");

  // Imported lazily so the seed reuses the app's own engine rather than a copy
  // of its rules — the demo data is therefore built exactly as real data is.
  const { ensureLeopardsCourier } = await import("../src/lib/leopards/courier");
  const { recordTrackingEvents, recomputeShipment } = await import("../src/lib/orders/tracking");
  const { resolveCourierStatus } = await import("../src/lib/leopards/status-map");

  const store = await prisma.store.findFirstOrThrow({ where: { name: "Dekorify" } });
  console.log(`  Store: ${store.name}`);

  // Clear any previous tracking demo data for a clean, repeatable run.
  const removed = await prisma.order.deleteMany({ where: { storeId: store.id } });
  if (removed.count > 0) console.log(`  Cleared ${removed.count} previous orders.`);

  const courierId = await ensureLeopardsCourier(store.id);

  await prisma.courier.update({
    where: { id: courierId },
    data: {
      originCityId: "789",
      returnAddress: "Shop 4, Main Boulevard, Gulberg III, Lahore",
    },
  });

  // City IDs so booking works out of the box in the demo.
  for (const city of CITIES) {
    await prisma.courierStatusMapping.upsert({
      where: {
        courierId_courierStatus: { courierId, courierStatus: `city:${city.name.toLowerCase()}` },
      },
      update: { internalStatus: city.id },
      create: {
        courierId,
        courierStatus: `city:${city.name.toLowerCase()}`,
        internalStatus: city.id,
      },
    });
  }
  console.log(`  ${CITIES.length} city IDs mapped.`);

  const mappings = (
    await prisma.courierStatusMapping.findMany({ where: { courierId } })
  ).map((mapping) => ({
    courierStatus: mapping.courierStatus,
    internalStatus: mapping.internalStatus,
    isIssue: mapping.isIssue,
    isAttempt: mapping.isAttempt,
    isTerminal: mapping.isTerminal,
  }));

  // Build orders from the most recent sales so the two sides line up.
  const sales = await prisma.sale.findMany({
    where: { storeId: store.id, deletedAt: null, isCancelled: false },
    orderBy: { date: "desc" },
    take: 260,
  });

  console.log(`  Building orders from ${sales.length} recent sales...`);

  let ordersCreated = 0;
  let shipmentsCreated = 0;
  let eventsCreated = 0;

  for (const sale of sales) {
    const city = pick(CITIES);
    const isPrepaid = sale.financialStatus === "PAID";

    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        saleId: sale.id,
        orderNumber: sale.orderId,
        shopifyOrderId: String(randomInt(4_000_000_000, 4_999_999_999)),
        shopifyOrderGid: `gid://shopify/Order/${randomInt(4_000_000_000, 4_999_999_999)}`,
        placedAt: sale.date,
        customerName: sale.customerName,
        customerPhone: `03${randomInt(0, 4)}${randomInt(10_000_000, 99_999_999)}`,
        customerEmail: sale.customerName
          ? `${sale.customerName.toLowerCase().replace(/\s+/g, ".")}@example.com`
          : null,
        address1: pick(STREETS),
        city: city.name,
        province: city.province,
        postalCode: String(randomInt(10_000, 79_999)),
        country: "Pakistan",
        subtotalMinor: sale.grossAmountMinor - sale.discountMinor,
        discountMinor: sale.discountMinor,
        shippingMinor: sale.shippingRevenueMinor,
        totalMinor: sale.netRevenueMinor > 0n ? sale.netRevenueMinor : sale.grossAmountMinor,
        currency: sale.currency,
        paymentMethod: isPrepaid ? "PREPAID" : "COD",
        paymentStatus: isPrepaid ? "PAID" : "PENDING",
        shopifyFinancialStatus: sale.financialStatus,
        shopifyFulfillmentStatus: sale.fulfillmentStatus,
        status: "NEW",
        items: {
          create: [
            {
              title: sale.productName ?? "Item",
              sku: sale.sku,
              quantity: sale.quantity,
              unitPriceMinor:
                sale.quantity > 0 ? sale.grossAmountMinor / BigInt(sale.quantity) : sale.grossAmountMinor,
              totalMinor: sale.grossAmountMinor,
            },
          ],
        },
      },
    });
    ordersCreated += 1;

    const journey = pickJourney();
    if (journey.steps.length === 0) {
      // Confirmed but not yet booked — a real state the board must show.
      await prisma.order.update({
        where: { id: order.id },
        data: { status: random() < 0.5 ? "CONFIRMED" : "READY_TO_SHIP" },
      });
      continue;
    }

    const bookedAt = addHours(startOfDay(sale.date), randomInt(9, 17));
    const trackingNumber = `LE${randomInt(100_000_000, 999_999_999)}`;

    const shipment = await prisma.shipment.create({
      data: {
        storeId: store.id,
        orderId: order.id,
        courierId,
        trackingNumber,
        courierOrderId: order.orderNumber,
        status: "SHIPMENT_CREATED",
        bookedAt,
        weightGrams: randomInt(300, 2500),
        pieces: 1,
        codAmountMinor: isPrepaid ? 0n : order.totalMinor,
        expectedDeliveryAt: addDays(bookedAt, randomInt(2, 4)),
      },
    });
    shipmentsCreated += 1;

    // Only play the part of the journey that has actually happened by now.
    const events = journey.steps
      .map(([courierStatus, hoursAfter]) => {
        const occurredAt = addHours(bookedAt, hoursAfter + randomInt(0, 3));
        return { courierStatus, occurredAt };
      })
      .filter((event) => event.occurredAt <= TODAY);

    if (events.length === 0) continue;

    const incoming = events.map((event) => {
      const resolved = resolveCourierStatus(event.courierStatus, mappings);
      return {
        occurredAt: event.occurredAt,
        source: "LEOPARDS" as const,
        internalStatus: resolved.internalStatus,
        courierStatus: event.courierStatus,
        location: locationFor(event.courierStatus, city.hub),
        // Same as the real sync: the mapping decides what counts as an attempt.
        countsAsAttempt: resolved.isAttempt,
        description: describe(event.courierStatus),
      };
    });

    const { created } = await recordTrackingEvents(shipment.id, incoming);
    eventsCreated += created;

    await recomputeShipment(shipment.id);
  }

  console.log(`  ${ordersCreated} orders`);
  console.log(`  ${shipmentsCreated} shipments`);
  console.log(`  ${eventsCreated} tracking events`);

  // A couple of hand-written notes so the notes panel is not empty.
  const flagged = await prisma.order.findMany({
    where: { storeId: store.id, hasIssue: true },
    take: 3,
    select: { id: true },
  });
  const user = await prisma.user.findFirst({ where: { email: "hellodekorify@gmail.com" } });

  for (const order of flagged) {
    await prisma.orderNote.create({
      data: {
        storeId: store.id,
        orderId: order.id,
        userId: user?.id ?? null,
        kind: "NOTE",
        body: pick([
          "Called the customer — asked us to deliver after 6pm.",
          "Number was switched off. Trying the alternate number tomorrow.",
          "Customer confirmed the address is correct; asked courier to reattempt.",
        ]),
      },
    });
  }

  const summary = await prisma.order.groupBy({
    by: ["status"],
    where: { storeId: store.id },
    _count: { _all: true },
  });

  console.log("\n  Order book:");
  for (const row of summary.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`    ${row.status.padEnd(24)} ${row._count._all}`);
  }

  const issues = await prisma.order.count({ where: { storeId: store.id, hasIssue: true } });
  console.log(`\n  ${issues} orders need attention.`);
  console.log("\nDone.");
}

function locationFor(courierStatus: string, hub: string): string {
  const status = courierStatus.toLowerCase();
  if (status.includes("booked")) return "Lahore";
  if (status.includes("picked")) return "Lahore Origin";
  if (status.includes("transit")) return "In network";
  if (status.includes("return")) return "Lahore";
  return hub;
}

function describe(courierStatus: string): string | null {
  const status = courierStatus.toLowerCase();
  if (status.includes("not available")) return "Rider called, no answer at the address";
  if (status.includes("phone not responding")) return "Number switched off";
  if (status.includes("incorrect address")) return "Address could not be located";
  if (status.includes("refused")) return "Customer declined the parcel";
  if (status.includes("delivered")) return "Handed over and cash collected";
  if (status.includes("rescheduled")) return "Re-attempt booked for the next working day";
  return null;
}

main()
  .catch((error) => {
    console.error("\nSeeding failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
