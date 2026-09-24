/**
 * Getting CN numbers into the system.
 *
 * This module exists because of a hard limit in Leopards' API: it can tell you
 * everything about a parcel you name, and nothing at all about which parcels
 * exist. `trackBookedPacket` requires `track_numbers`; asked without one it
 * answers "Track Number is required". There is no list endpoint — probing on
 * 24 September 2026 found `getBookedPackets`, `getAllBookedPackets`,
 * `getBookedPacketList`, `getPacketList`, `getShipmentList`, `getCNList`,
 * `getOrderStatus` and `trackBookedPacketByOrderId` all returning 404, against
 * the four that do exist (`bookPacket`, `trackBookedPacket`,
 * `cancelBookedPackets`, `getAllCities`).
 *
 * So the set of CNs has to be established here rather than discovered. Three
 * ways in, none of which involve another vendor's API:
 *
 *   MANUAL  typed into the dashboard
 *   CSV     pasted or uploaded, e.g. a booked-packets export downloaded from
 *           the Leopards merchant portal by hand
 *   BOOKED  created by this app through `bookPacket`, which returns the CN
 *
 * BOOKED is the one that closes the loop: book through the app and the CN is
 * known from birth, with no import step at all.
 */

import { prisma } from "../db";

export const INTAKE_SOURCES = ["MANUAL", "CSV", "BOOKED"] as const;
export type IntakeSource = (typeof INTAKE_SOURCES)[number];

/**
 * Leopards CNs seen in the wild look like `LE7544278331` — two letters and
 * ten digits — but the format is not documented, so this only rejects what is
 * clearly not a CN rather than enforcing a shape Leopards never promised.
 */
const PLAUSIBLE_CN = /^[A-Za-z0-9-]{6,32}$/;

export interface IntakeResult {
  added: string[];
  duplicates: string[];
  rejected: { value: string; reason: string }[];
}

/**
 * Parse free text into candidate CN numbers.
 *
 * Accepts one per line, comma-separated, or a CSV whose first column is the
 * CN — which is what a portal export looks like. A header row naming the
 * column is skipped.
 */
export function parseTrackingNumbers(input: string): string[] {
  const out: string[] = [];

  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Take the first field of a delimited row; a bare list is unaffected.
    for (const cell of trimmed.split(/[,;\t]/)) {
      const value = cell.trim().replace(/^["']|["']$/g, "");
      if (!value) continue;
      // Skip an obvious header.
      if (/^(cn|cn[\s_-]?number|tracking[\s_-]?number|track[\s_-]?number|consignment)$/i.test(value)) {
        break;
      }
      out.push(value);
      break;
    }
  }

  return out;
}

export async function addTrackingNumbers(
  storeId: string,
  values: string[],
  source: IntakeSource,
): Promise<IntakeResult> {
  const result: IntakeResult = { added: [], duplicates: [], rejected: [] };

  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const raw of values) {
    const value = raw.trim().toUpperCase();
    if (!value) continue;

    if (!PLAUSIBLE_CN.test(value)) {
      result.rejected.push({ value: raw.trim(), reason: "Not a usable tracking number" });
      continue;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    candidates.push(value);
  }

  if (candidates.length === 0) return result;

  const existing = await prisma.leopardsShipment.findMany({
    where: { storeId, trackingNumber: { in: candidates } },
    select: { trackingNumber: true },
  });
  const known = new Set(existing.map((row) => row.trackingNumber));

  const fresh = candidates.filter((cn) => !known.has(cn));
  result.duplicates = candidates.filter((cn) => known.has(cn));

  if (fresh.length > 0) {
    await prisma.leopardsShipment.createMany({
      data: fresh.map((trackingNumber) => ({ storeId, trackingNumber, source })),
    });
    result.added = fresh;
  }

  return result;
}

export async function removeShipment(storeId: string, trackingNumber: string): Promise<boolean> {
  const deleted = await prisma.leopardsShipment.deleteMany({
    where: { storeId, trackingNumber },
  });
  return deleted.count > 0;
}
