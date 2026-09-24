/**
 * Checks the Leopards tracking parser and status rules against payloads
 * captured from the live API on 24 September 2026.
 *
 * These are real shapes. In particular the events array really is keyed
 * "Tracking Detail" with a space, there really is no location field, and
 * Leopards really does write "Shipment picked in" rather than "picked up" —
 * each of which broke an earlier implementation.
 *
 *   npm run test:leopards
 */

import { normalisePacket, parseLeopardsTimestamp } from "../src/lib/leopards/tracking";
import { classifyStatus, extractLocation, SHIPMENT_STATUS } from "../src/lib/leopards/statuses";

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok    ${label} = ${a}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}: got ${a}, expected ${e}`);
  }
}

// A real packet, trimmed of nothing that matters.
const REAL_PACKET = {
  booked_packet_id: 207791479,
  booking_date: "19/09/2026",
  track_number: "LE7544278331",
  track_number_short: 7544278331,
  booked_packet_weight: "100.00",
  booked_packet_no_piece: 1,
  booked_packet_collect_amount: "5299.00",
  booked_packet_order_id: "#DK-0926-7729",
  origin_country_name: "PAKISTAN",
  origin_city_name: "LAHORE",
  destination_city_name: "GUJRANWALA",
  shipment_name_eng: "DEKORIFY",
  consignment_name_eng: "SAIRA TARIQ",
  consignment_email: "buyer@example.com",
  consignment_phone: "03004326031",
  consignment_address: "Tipu block house no. 146 shalimar town gujranwala",
  special_instructions: "Table Scape Vases - Set of 6(BV - 6) Qty=1",
  booked_packet_status: "Delivered",
  status_remarks: ["SELF SAIRA TARIQ"],
  reverseCN: null,
  "Tracking Detail": [
    {
      Status: "Arrived at Station in EMPRESS HUB",
      Status_With_City: "Arrived at Station in LAHORE",
      Reciever_Name: null,
      Activity_Date: "2026-09-20",
      Activity_Time: "01:26:15",
      Reason: null,
      Activity_datetime: "2026-09-20 01:26:15",
    },
    {
      Status: "Dispatched to GUJRANWALA",
      Status_With_City: "Dispatched to GUJRANWALA",
      Activity_Date: "2026-09-20",
      Activity_Time: "01:26:19",
      Activity_datetime: "2026-09-20 01:26:19",
    },
    {
      Status: "Arrived at Station in GUJRANWALA",
      Status_With_City: "Arrived at Station in GUJRANWALA",
      Activity_Date: "2026-09-21",
      Activity_Time: "01:48:36",
      Activity_datetime: "2026-09-21 01:48:36",
    },
    {
      Status: "Assigned to courier in GUJRANWALA",
      Status_With_City: "Assigned to courier in GUJRANWALA",
      Activity_Date: "2026-09-21",
      Activity_Time: "08:36:16",
      Activity_datetime: "2026-09-21 08:36:16",
    },
    {
      Status: "Delivered",
      Status_With_City: "Delivered",
      Reciever_Name: "SAIRA TARIQ",
      Reason: "SELF",
      Activity_Date: "2026-09-21",
      Activity_Time: "16:42:00",
      Activity_datetime: "2026-09-21 16:42:00",
    },
  ],
};

console.log("PACKET — parsed from a real response");
const packet = normalisePacket(REAL_PACKET as never)!;
check("tracking number", packet.trackingNumber, "LE7544278331");
check("reference from booked_packet_order_id", packet.referenceNumber, "#DK-0926-7729");
check("packet id", packet.packetId, "207791479");
check("courier status verbatim", packet.courierStatus, "Delivered");
check("classified", packet.status, SHIPMENT_STATUS.DELIVERED);
check("terminal", packet.isTerminal, true);
// Five events only parse if the "Tracking Detail" key is read correctly.
check("events found under 'Tracking Detail'", packet.events.length, 5);
check("origin", packet.originCity, "LAHORE");
check("destination", packet.destinationCity, "GUJRANWALA");
check("COD kept as given", packet.codAmount, "5299.00");
check("contents", packet.specialInstructions, "Table Scape Vases - Set of 6(BV - 6) Qty=1");
check("remarks array joined", packet.statusRemarks, "SELF SAIRA TARIQ");
check("reverse CN absent", packet.reverseCn, null);
check("weight rounded to grams", packet.weightGrams, 100);
check("delivery attempts", packet.deliveryAttempts, 1);
check("raw response retained", packet.raw.length > 100, true);

console.log("\nEVENTS");
const [first, , , assigned, delivered] = packet.events;
check("oldest first", first.status, "Arrived at Station in EMPRESS HUB");
// Status_With_City resolves the hub to a city; Status alone would say EMPRESS HUB.
check("location prefers Status_With_City", first.location, "LAHORE");
check("assigned-to-courier location", assigned.location, "GUJRANWALA");
check("receiver name (Leopards' spelling)", delivered.receiverName, "SAIRA TARIQ");
check("reason read from capital-R Reason", delivered.reason, "SELF");
check("delivery marked as an attempt", delivered.isAttempt, true);
check("transit event not an attempt", first.isAttempt, false);
check("fingerprints unique", new Set(packet.events.map((e) => e.fingerprint)).size, 5);

console.log("\nTIMESTAMPS — Leopards reports Pakistan local time (UTC+5)");
const t = parseLeopardsTimestamp("2026-09-20", "01:26:15");
check("parsed as PKT, not server-local", t?.toISOString(), "2026-09-19T20:26:15.000Z");
check(
  "combined datetime form",
  parseLeopardsTimestamp("2026-09-21 16:42:00", null)?.toISOString(),
  "2026-09-21T11:42:00.000Z",
);
check(
  "day-first booking date",
  parseLeopardsTimestamp("19/09/2026", null)?.toISOString(),
  "2026-09-18T19:00:00.000Z",
);
check("12-hour clock", parseLeopardsTimestamp("2026-09-21", "04:30 PM")?.toISOString(), "2026-09-21T11:30:00.000Z");
check("impossible date rejected", parseLeopardsTimestamp("2026-02-31", null), null);
check("unparseable rejected", parseLeopardsTimestamp("soon", null), null);
check("empty rejected", parseLeopardsTimestamp(null, null), null);
check("delivered timestamp taken from the delivering event", packet.deliveredAt?.toISOString(), "2026-09-21T11:42:00.000Z");

console.log("\nSTATUS RULES — against wording Leopards actually uses");
const cases: [string, string][] = [
  // "Assigned to courier" is Leopards for "a rider has it", not a booking step.
  ["Assigned to courier in GUJRANWALA", SHIPMENT_STATUS.OUT_FOR_DELIVERY],
  ["Out for delivery", SHIPMENT_STATUS.OUT_FOR_DELIVERY],
  // Leopards writes "picked in", not "picked up".
  ["Shipment picked in  EMPRESS HUB", SHIPMENT_STATUS.PICKED_UP],
  ["Arrived at Station in LAHORE", SHIPMENT_STATUS.IN_TRANSIT],
  ["Dispatched to MULTAN", SHIPMENT_STATUS.IN_TRANSIT],
  ["Delivered", SHIPMENT_STATUS.DELIVERED],
  ["Consignee not available", SHIPMENT_STATUS.CUSTOMER_NOT_AVAILABLE],
  ["Customer not available", SHIPMENT_STATUS.CUSTOMER_NOT_AVAILABLE],
  ["Phone not responding", SHIPMENT_STATUS.CUSTOMER_NOT_AVAILABLE],
  ["Delivery attempted", SHIPMENT_STATUS.ATTEMPT_FAILED],
  ["Incorrect address", SHIPMENT_STATUS.ATTEMPT_FAILED],
  ["Refused by customer", SHIPMENT_STATUS.ATTEMPT_FAILED],
  ["Return to shipper", SHIPMENT_STATUS.RETURNED],
  ["RTO", SHIPMENT_STATUS.RETURNED],
  ["Shipment cancelled", SHIPMENT_STATUS.CANCELLED],
  ["On hold", SHIPMENT_STATUS.EXCEPTION],
  ["Consignment booked", SHIPMENT_STATUS.PENDING],
];
for (const [text, expected] of cases) {
  check(`"${text}"`, classifyStatus(text).status, expected);
}

console.log("\nUNRECOGNISED WORDING");
const odd = classifyStatus("Handed to partner network for onward carriage");
check("classified UNKNOWN", odd.status, SHIPMENT_STATUS.UNKNOWN);
// Marked so the UI can say it is unclassified rather than imply a state.
check("flagged unrecognised", odd.recognised, false);
check("empty status unrecognised", classifyStatus("").recognised, false);

console.log("\nLOCATION EXTRACTION");
check("after ' in '", extractLocation("Arrived at Station in GUJRANWALA"), "GUJRANWALA");
check("after ' to '", extractLocation("Dispatched to BAHAWALNAGAR"), "BAHAWALNAGAR");
// The later of " in " / " to " wins, or this yields "courier in GUJRANWALA".
check("last separator wins", extractLocation("Assigned to courier in GUJRANWALA"), "GUJRANWALA");
check("double space tolerated", extractLocation("Shipment picked in  EMPRESS HUB"), "EMPRESS HUB");
check("no place in text", extractLocation("Delivered"), null);
check("trailing non-place rejected", extractLocation("Assigned to courier"), null);
check("empty", extractLocation(""), null);

console.log("\nMISSING DATA IS NEVER INVENTED");
const bare = normalisePacket({ track_number: "LE0000000001" } as never)!;
check("no events", bare.events.length, 0);
check("no reference", bare.referenceNumber, null);
check("no origin", bare.originCity, null);
check("no COD", bare.codAmount, null);
check("no booking date", bare.bookedAt, null);
check("no delivery date", bare.deliveredAt, null);
check("attempts default to zero", bare.deliveryAttempts, 0);
check("status unrecognised", bare.recognised, false);
check("packet with no CN is rejected", normalisePacket({} as never), null);

const rule = "=".repeat(56);
console.log(`\n${rule}\n  passed ${pass}   failed ${fail}\n${rule}`);
process.exit(fail === 0 ? 0 : 1);
