/**
 * Reading Leopards' `trackBookedPacket` response.
 *
 * The shape below was captured from live responses on 24 September 2026 rather
 * than taken from documentation, because Leopards publishes none for it. Two
 * details are easy to get wrong and were both wrong here before:
 *
 *   - the events array is keyed `"Tracking Detail"` — two words, with a space,
 *     not `TrackDetail` or `tracking_detail`;
 *   - there is no location field. The place is inside the status text
 *     ("Arrived at Station in GUJRANWALA"), and `Status_With_City` is the
 *     variant that resolves a hub name to a city.
 *
 * A real packet object looks like this (trimmed):
 *
 *   {
 *     "booked_packet_id": 207791479,
 *     "booking_date": "19/09/2026",
 *     "track_number": "LE7544278331",
 *     "booked_packet_order_id": "#DK-0926-7729",
 *     "booked_packet_collect_amount": "5299.00",
 *     "origin_city_name": "LAHORE",
 *     "destination_city_name": "GUJRANWALA",
 *     "consignment_name_eng": "SAIRA TARIQ",
 *     "booked_packet_status": "Delivered",
 *     "status_remarks": ["SELF SAIRA TARIQ"],
 *     "Tracking Detail": [
 *       { "Status": "Dispatched to GUJRANWALA",
 *         "Status_With_City": "Dispatched to GUJRANWALA",
 *         "Reciever_Name": null, "Reason": null,
 *         "Activity_Date": "2026-09-20", "Activity_Time": "01:26:19",
 *         "Activity_datetime": "2026-09-20 01:26:19" }
 *     ]
 *   }
 *
 * Note Leopards' own spelling of `Reciever_Name`; it is reproduced here
 * deliberately, not corrected.
 */

import { createHash } from "node:crypto";
import { LEOPARDS_ENDPOINTS, leopardsPost, type LeopardsCredentials } from "./client";
import {
  classifyStatus,
  extractLocation,
  isTerminalStatus,
  SHIPMENT_STATUS,
  type ShipmentStatus,
} from "./statuses";

/** Leopards fails the whole call rather than truncating, so keep batches modest. */
export const TRACK_BATCH_SIZE = 20;

/**
 * Leopards timestamps are Pakistan wall-clock time with no offset attached.
 * Pakistan Standard Time is a fixed UTC+5 and observes no daylight saving, so
 * the offset can be applied directly.
 *
 * Parsing these with `new Date(y, m, d, …)` would read them in whatever zone
 * the server happens to run in — correct only by luck on a machine in Karachi,
 * and five hours out on a UTC host.
 */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

export function parseLeopardsTimestamp(
  date: string | null | undefined,
  time: string | null | undefined,
): Date | null {
  const text = (date ?? "").trim();
  if (!text) return null;

  let year: number;
  let month: number;
  let day: number;
  let rest = "";

  // "2026-09-20" or "2026-09-20 01:26:19"
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.*))?$/);
  // "19/09/2026" or "19-09-2026"
  const dayFirst = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T ](.*))?$/);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
    rest = iso[4] ?? "";
  } else if (dayFirst) {
    day = Number(dayFirst[1]);
    month = Number(dayFirst[2]);
    year = Number(dayFirst[3]);
    rest = dayFirst[4] ?? "";
  } else {
    return null;
  }

  const clock = parseClock(rest || (time ?? ""));
  const utcMs = Date.UTC(year, month - 1, day, clock.hours, clock.minutes, clock.seconds);
  const instant = new Date(utcMs - PKT_OFFSET_MS);

  // A date that rolled over (31 February, say) is a parse failure, not a date.
  if (Number.isNaN(instant.getTime())) return null;
  const check = new Date(utcMs);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  return instant;
}

function parseClock(value: string): { hours: number; minutes: number; seconds: number } {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/);
  if (!match) return { hours: 0, minutes: 0, seconds: 0 };

  let hours = Number(match[1]);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  return { hours, minutes: Number(match[2]), seconds: match[3] ? Number(match[3]) : 0 };
}

export interface NormalisedEvent {
  /** Leopards' exact wording. */
  status: string;
  statusWithCity: string | null;
  location: string | null;
  receiverName: string | null;
  reason: string | null;
  occurredAt: Date | null;
  rawDate: string | null;
  rawTime: string | null;
  isAttempt: boolean;
  /** Stable across syncs, so re-fetching cannot duplicate an event. */
  fingerprint: string;
}

export interface NormalisedPacket {
  trackingNumber: string;
  referenceNumber: string | null;
  packetId: string | null;

  courierStatus: string | null;
  status: ShipmentStatus;
  /** False when Leopards used wording no rule recognises. */
  recognised: boolean;
  isTerminal: boolean;

  currentLocation: string | null;
  lastEventAt: Date | null;

  originCity: string | null;
  originCountry: string | null;
  destinationCity: string | null;

  consigneeName: string | null;
  consigneePhone: string | null;
  consigneeEmail: string | null;
  consigneeAddress: string | null;

  shipperName: string | null;
  specialInstructions: string | null;
  statusRemarks: string | null;
  reverseCn: string | null;

  weightGrams: number | null;
  pieces: number | null;
  codAmount: string | null;

  bookedAt: Date | null;
  deliveredAt: Date | null;
  deliveryAttempts: number;

  events: NormalisedEvent[];
  /** The packet object as received, for tracing any displayed value back. */
  raw: string;
}

export interface TrackingFetch {
  packets: NormalisedPacket[];
  /** CNs that were asked for but came back with no packet. */
  missing: string[];
  raw: string;
}

/**
 * Fetch and normalise a batch of CN numbers.
 *
 * Leopards answers `{"status":0,"error":"No Packet Found"}` when none of the
 * numbers match, which `leopardsPost` raises as an error. That is a legitimate
 * answer rather than a failure, so it is caught and reported as "all missing".
 */
export async function fetchTracking(
  credentials: LeopardsCredentials,
  trackingNumbers: string[],
): Promise<TrackingFetch> {
  const wanted = trackingNumbers.map((cn) => cn.trim()).filter(Boolean);
  if (wanted.length === 0) return { packets: [], missing: [], raw: "" };

  let data: Record<string, unknown>;
  let raw: string;
  try {
    const response = await leopardsPost(credentials, LEOPARDS_ENDPOINTS.trackBookedPacket, {
      track_numbers: wanted.join(","),
    });
    data = response.data;
    raw = response.raw;
  } catch (error) {
    if (/no packet found/i.test((error as Error).message)) {
      return { packets: [], missing: wanted, raw: (error as { detail?: string }).detail ?? "" };
    }
    throw error;
  }

  const list = Array.isArray(data.packet_list) ? data.packet_list : [];
  const packets = list
    .map((entry) => normalisePacket(entry as Record<string, unknown>))
    .filter((packet): packet is NormalisedPacket => packet !== null);

  const found = new Set(packets.map((packet) => packet.trackingNumber.toUpperCase()));
  const missing = wanted.filter((cn) => !found.has(cn.toUpperCase()));

  return { packets, missing, raw };
}

export function normalisePacket(packet: Record<string, unknown>): NormalisedPacket | null {
  const trackingNumber = str(packet.track_number) ?? str(packet.track_number_short);
  if (!trackingNumber) return null;

  const events = normaliseEvents(packet["Tracking Detail"]);

  const courierStatus = str(packet.booked_packet_status);
  const classified = classifyStatus(courierStatus);

  // The latest event is the best statement of where the parcel is; the
  // packet-level status says what it is doing. Both come from Leopards.
  const latest = events.length > 0 ? events[events.length - 1] : null;

  // Leopards gives no delivery timestamp of its own, so it is taken from the
  // delivering event rather than invented.
  const deliveredEvent =
    classified.status === SHIPMENT_STATUS.DELIVERED
      ? [...events].reverse().find((event) => /\bdeliver/i.test(event.status))
      : undefined;

  return {
    trackingNumber,
    referenceNumber: str(packet.booked_packet_order_id),
    packetId: str(packet.booked_packet_id),

    courierStatus,
    status: classified.status,
    recognised: classified.recognised,
    isTerminal: isTerminalStatus(classified.status),

    currentLocation: locationOf(latest, packet),
    lastEventAt: latest?.occurredAt ?? null,

    originCity: str(packet.origin_city_name),
    originCountry: str(packet.origin_country_name),
    destinationCity: str(packet.destination_city_name),

    consigneeName: str(packet.consignment_name_eng),
    consigneePhone: str(packet.consignment_phone),
    consigneeEmail: str(packet.consignment_email),
    consigneeAddress: str(packet.consignment_address),

    shipperName: str(packet.shipment_name_eng),
    specialInstructions: str(packet.special_instructions),
    statusRemarks: remarks(packet.status_remarks),
    reverseCn: str(packet.reverseCN),

    weightGrams: int(packet.booked_packet_weight),
    pieces: int(packet.booked_packet_no_piece),
    codAmount: str(packet.booked_packet_collect_amount),

    bookedAt: parseLeopardsTimestamp(str(packet.booking_date), null),
    deliveredAt: deliveredEvent?.occurredAt ?? null,
    deliveryAttempts: events.filter((event) => event.isAttempt).length,

    events,
    raw: JSON.stringify(packet),
  };
}

/**
 * Events arrive oldest-first and are kept that way, which is the order the
 * timeline reads in. Anything without a status line is dropped: an event we
 * cannot name is not worth showing.
 */
function normaliseEvents(source: unknown): NormalisedEvent[] {
  if (!Array.isArray(source)) return [];

  const events = source
    .map((entry) => normaliseEvent(entry as Record<string, unknown>))
    .filter((event): event is NormalisedEvent => event !== null);

  // Leopards has been seen to repeat an event across syncs with identical
  // wording and timestamp; the fingerprint collapses those.
  const seen = new Set<string>();
  const unique = events.filter((event) => {
    if (seen.has(event.fingerprint)) return false;
    seen.add(event.fingerprint);
    return true;
  });

  return unique.sort((a, b) => {
    if (!a.occurredAt || !b.occurredAt) return 0;
    return a.occurredAt.getTime() - b.occurredAt.getTime();
  });
}

function normaliseEvent(entry: Record<string, unknown>): NormalisedEvent | null {
  const status = str(entry.Status);
  if (!status) return null;

  const statusWithCity = str(entry.Status_With_City);
  const rawDate = str(entry.Activity_Date);
  const rawTime = str(entry.Activity_Time);
  const combined = str(entry.Activity_datetime);

  const occurredAt = combined
    ? parseLeopardsTimestamp(combined, null)
    : parseLeopardsTimestamp(rawDate, rawTime);

  const classified = classifyStatus(status);

  return {
    status,
    statusWithCity,
    // Status_With_City resolves a hub name to a city, so it is preferred.
    location: extractLocation(statusWithCity) ?? extractLocation(status),
    receiverName: str(entry.Reciever_Name) ?? str(entry.Receiver_Name),
    reason: str(entry.Reason),
    occurredAt,
    rawDate,
    rawTime,
    isAttempt: classified.isAttempt,
    fingerprint: fingerprintOf(status, combined ?? `${rawDate ?? ""} ${rawTime ?? ""}`),
  };
}

function fingerprintOf(status: string, when: string): string {
  return createHash("sha1")
    .update(`${status.trim().toLowerCase()}|${when.trim()}`)
    .digest("hex")
    .slice(0, 32);
}

function locationOf(
  latest: NormalisedEvent | null,
  packet: Record<string, unknown>,
): string | null {
  if (latest?.location) return latest.location;
  // A bare "Delivered" carries no place; the destination city is the closest
  // thing Leopards has actually stated, and it is still their data.
  return str(packet.destination_city_name);
}

// ---------------------------------------------------------------------------
// Field readers — every one returns null rather than a substitute value
// ---------------------------------------------------------------------------

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number") return String(value);
  return null;
}

function int(value: unknown): number | null {
  const text = str(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function remarks(value: unknown): string | null {
  if (Array.isArray(value)) {
    const joined = value.filter((item) => typeof item === "string" && item.trim()).join("; ");
    return joined || null;
  }
  return str(value);
}
