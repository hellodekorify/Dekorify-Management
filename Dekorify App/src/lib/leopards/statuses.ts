/**
 * Leopards status wording → the buckets the dashboard groups by.
 *
 * The rules below were written against wording observed in live
 * `trackBookedPacket` responses, not from a published list — Leopards does not
 * publish one. Anything unrecognised becomes UNKNOWN and is still shown with
 * its original wording; a status we cannot classify is never quietly dropped
 * and never guessed into a neighbouring bucket.
 */

export const SHIPMENT_STATUS = {
  PENDING: "PENDING",
  PICKED_UP: "PICKED_UP",
  IN_TRANSIT: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  ATTEMPT_FAILED: "ATTEMPT_FAILED",
  CUSTOMER_NOT_AVAILABLE: "CUSTOMER_NOT_AVAILABLE",
  RETURNED: "RETURNED",
  CANCELLED: "CANCELLED",
  EXCEPTION: "EXCEPTION",
  UNKNOWN: "UNKNOWN",
} as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUS)[keyof typeof SHIPMENT_STATUS];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING: "Pending / processing",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  ATTEMPT_FAILED: "Delivery attempt failed",
  CUSTOMER_NOT_AVAILABLE: "Customer not available",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
  EXCEPTION: "Exception",
  UNKNOWN: "Not classified",
};

/** Badge colouring, so a status reads the same wherever it appears. */
export const SHIPMENT_STATUS_TONES: Record<
  ShipmentStatus,
  "neutral" | "brand" | "positive" | "negative" | "warning" | "info"
> = {
  PENDING: "neutral",
  PICKED_UP: "info",
  IN_TRANSIT: "info",
  OUT_FOR_DELIVERY: "brand",
  DELIVERED: "positive",
  ATTEMPT_FAILED: "negative",
  CUSTOMER_NOT_AVAILABLE: "warning",
  RETURNED: "negative",
  CANCELLED: "neutral",
  EXCEPTION: "warning",
  UNKNOWN: "neutral",
};

/** Statuses a parcel cannot move on from, so polling can stop. */
export const TERMINAL_STATUSES: ShipmentStatus[] = [
  SHIPMENT_STATUS.DELIVERED,
  SHIPMENT_STATUS.RETURNED,
  SHIPMENT_STATUS.CANCELLED,
];

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as string[]).includes(status);
}

interface Rule {
  /** Matched against the lower-cased Leopards text. */
  match: RegExp;
  status: ShipmentStatus;
  /** The event represents a delivery having been attempted. */
  isAttempt?: boolean;
}

/**
 * Order matters: the first rule that matches wins, so the specific sits above
 * the general. "Assigned to courier" must be read before any rule mentioning
 * "assigned", because in Leopards' wording it means the rider is carrying the
 * parcel now — the step immediately before "Delivered", not a booking step.
 */
const RULES: Rule[] = [
  // --- Endings --------------------------------------------------------------
  { match: /\breturn(ed)?\s+(to\s+)?(shipper|origin|sender)\b/, status: SHIPMENT_STATUS.RETURNED },
  { match: /\brto\b/, status: SHIPMENT_STATUS.RETURNED },
  { match: /\breturned\b/, status: SHIPMENT_STATUS.RETURNED },
  { match: /\bcancell?ed\b/, status: SHIPMENT_STATUS.CANCELLED },
  { match: /\bdeliver(ed|y done)\b/, status: SHIPMENT_STATUS.DELIVERED, isAttempt: true },

  // --- Failed attempts ------------------------------------------------------
  {
    match: /\b(consignee|customer|receiver)\s+(not\s+)?(available|present|at\s+home|responding)\b/,
    status: SHIPMENT_STATUS.CUSTOMER_NOT_AVAILABLE,
    isAttempt: true,
  },
  {
    match: /\b(phone|number|mobile)\s+(not\s+responding|off|incorrect|switched off)\b/,
    status: SHIPMENT_STATUS.CUSTOMER_NOT_AVAILABLE,
    isAttempt: true,
  },
  { match: /\bpremises\s+closed\b/, status: SHIPMENT_STATUS.CUSTOMER_NOT_AVAILABLE, isAttempt: true },
  {
    match: /\b(refus|reject|cancel)(ed|led)?\s+by\s+(customer|consignee)\b/,
    status: SHIPMENT_STATUS.ATTEMPT_FAILED,
    isAttempt: true,
  },
  {
    match: /\b(attempt(ed)?|undelivered|delivery\s+failed|incorrect\s+address|address\s+not\s+found)\b/,
    status: SHIPMENT_STATUS.ATTEMPT_FAILED,
    isAttempt: true,
  },

  // --- Out for delivery -----------------------------------------------------
  // Leopards' own phrasing for "a rider has it".
  { match: /\bassigned\s+to\s+courier\b/, status: SHIPMENT_STATUS.OUT_FOR_DELIVERY },
  { match: /\b(out\s+for\s+delivery|assigned\s+for\s+delivery|with\s+courier)\b/, status: SHIPMENT_STATUS.OUT_FOR_DELIVERY },

  // --- Exceptions -----------------------------------------------------------
  { match: /\b(on\s+hold|held|damaged|lost|missing|misroute[d]?)\b/, status: SHIPMENT_STATUS.EXCEPTION },
  { match: /\b(reschedul|re-schedul)/, status: SHIPMENT_STATUS.EXCEPTION },

  // --- Movement -------------------------------------------------------------
  { match: /\b(arrived|received)\s+at\s+(station|hub|warehouse)\b/, status: SHIPMENT_STATUS.IN_TRANSIT },
  { match: /\b(dispatch|depart|forward|in\s+transit|on\s+the\s+way)/, status: SHIPMENT_STATUS.IN_TRANSIT },

  // --- Pickup ---------------------------------------------------------------
  // "Shipment picked in EMPRESS HUB" — Leopards writes "picked in", not
  // "picked up", so matching on "picked up" alone would miss every pickup.
  { match: /\b(shipment\s+)?pick(ed|up)?\s*(in|up|done)?\b/, status: SHIPMENT_STATUS.PICKED_UP },

  // --- Booked ---------------------------------------------------------------
  { match: /\b(booked|consignment\s+booked|pending\s+pickup|pending)\b/, status: SHIPMENT_STATUS.PENDING },
];

export interface ClassifiedStatus {
  status: ShipmentStatus;
  isAttempt: boolean;
  /** False when no rule matched, so the UI can say so rather than imply a state. */
  recognised: boolean;
}

export function classifyStatus(courierStatus: string | null | undefined): ClassifiedStatus {
  const text = (courierStatus ?? "").trim().toLowerCase();
  if (!text) return { status: SHIPMENT_STATUS.UNKNOWN, isAttempt: false, recognised: false };

  for (const rule of RULES) {
    if (rule.match.test(text)) {
      return { status: rule.status, isAttempt: rule.isAttempt ?? false, recognised: true };
    }
  }

  return { status: SHIPMENT_STATUS.UNKNOWN, isAttempt: false, recognised: false };
}

/**
 * Pull the place out of a Leopards status line.
 *
 * Their statuses embed it in the text — "Arrived at Station in GUJRANWALA",
 * "Dispatched to LAHORE" — and there is no separate location field. Whichever
 * of " in " / " to " appears last introduces the place, so "Assigned to courier
 * in GUJRANWALA" yields GUJRANWALA rather than "courier in GUJRANWALA".
 *
 * Returns null rather than a guess when the line carries no place at all, which
 * is the case for bare statuses like "Delivered".
 */
export function extractLocation(statusText: string | null | undefined): string | null {
  const text = (statusText ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const inAt = text.toLowerCase().lastIndexOf(" in ");
  const toAt = text.toLowerCase().lastIndexOf(" to ");
  const cut = Math.max(inAt, toAt);
  if (cut === -1) return null;

  const place = text.slice(cut + 4).trim();
  // A trailing fragment that is not a place — "Assigned to courier" — should
  // not be mistaken for one.
  if (!place || place.length < 2 || /^(courier|delivery|customer|consignee)$/i.test(place)) {
    return null;
  }
  return place;
}
