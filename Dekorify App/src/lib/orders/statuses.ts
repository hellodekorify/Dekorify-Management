/**
 * The internal order lifecycle.
 *
 * These statuses are ours. A courier's own wording is always preserved
 * alongside them on the tracking event — see CourierStatusMapping — so a
 * status we do not recognise never silently disappears.
 */

export const ORDER_STATUS = {
  // Processing
  NEW: "NEW",
  CONFIRMED: "CONFIRMED",
  PROCESSING: "PROCESSING",
  READY_TO_SHIP: "READY_TO_SHIP",
  SHIPMENT_CREATED: "SHIPMENT_CREATED",
  PICKED_UP: "PICKED_UP",

  // Delivery
  IN_TRANSIT: "IN_TRANSIT",
  ARRIVED_AT_DESTINATION: "ARRIVED_AT_DESTINATION",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERY_ATTEMPTED: "DELIVERY_ATTEMPTED",
  CUSTOMER_NOT_HOME: "CUSTOMER_NOT_HOME",
  CUSTOMER_UNAVAILABLE: "CUSTOMER_UNAVAILABLE",
  DELIVERY_FAILED: "DELIVERY_FAILED",
  RESCHEDULED: "RESCHEDULED",
  DELIVERED: "DELIVERED",

  // After delivery
  RETURN_REQUESTED: "RETURN_REQUESTED",
  RETURN_IN_TRANSIT: "RETURN_IN_TRANSIT",
  RETURNED: "RETURNED",
  REFUSED: "REFUSED",
  CANCELLED: "CANCELLED",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export type StatusTone =
  | "neutral"
  | "info"
  | "brand"
  | "warning"
  | "negative"
  | "positive";

export interface StatusDefinition {
  value: OrderStatus;
  label: string;
  /// Where it sits in the journey — drives grouping and the timeline rail.
  phase: "processing" | "delivery" | "closed";
  tone: StatusTone;
  /// Ordinal position, used to decide whether an event moves an order forward.
  rank: number;
  /// Needs a human to do something about it.
  isIssue?: boolean;
  /// The order has stopped moving.
  isTerminal?: boolean;
  /// The parcel was physically presented to the customer.
  isAttempt?: boolean;
  description: string;
}

export const ORDER_STATUSES: StatusDefinition[] = [
  { value: "NEW", label: "New order", phase: "processing", tone: "neutral", rank: 10,
    description: "Received from Shopify and not yet looked at." },
  { value: "CONFIRMED", label: "Confirmed", phase: "processing", tone: "info", rank: 20,
    description: "Checked and accepted — usually after a confirmation call." },
  { value: "PROCESSING", label: "Processing", phase: "processing", tone: "brand", rank: 30,
    description: "Being picked and packed." },
  { value: "READY_TO_SHIP", label: "Ready to ship", phase: "processing", tone: "brand", rank: 40,
    description: "Packed and waiting for a courier booking." },
  { value: "SHIPMENT_CREATED", label: "Shipment created", phase: "processing", tone: "info", rank: 50,
    description: "Booked with the courier; CN number issued." },
  { value: "PICKED_UP", label: "Picked up", phase: "delivery", tone: "info", rank: 60,
    description: "Collected by the courier." },

  { value: "IN_TRANSIT", label: "In transit", phase: "delivery", tone: "info", rank: 70,
    description: "Moving through the courier network." },
  { value: "ARRIVED_AT_DESTINATION", label: "Arrived at destination", phase: "delivery", tone: "info", rank: 80,
    description: "Reached the destination hub." },
  { value: "OUT_FOR_DELIVERY", label: "Out for delivery", phase: "delivery", tone: "warning", rank: 90,
    description: "With the rider today." },
  { value: "DELIVERY_ATTEMPTED", label: "Delivery attempted", phase: "delivery", tone: "warning", rank: 95,
    isAttempt: true, isIssue: true,
    description: "The rider tried and could not hand it over." },
  { value: "CUSTOMER_NOT_HOME", label: "Customer not home", phase: "delivery", tone: "warning", rank: 96,
    isAttempt: true, isIssue: true,
    description: "Nobody at the address." },
  { value: "CUSTOMER_UNAVAILABLE", label: "Customer unavailable", phase: "delivery", tone: "warning", rank: 97,
    isAttempt: true, isIssue: true,
    description: "Customer could not be reached." },
  { value: "DELIVERY_FAILED", label: "Delivery failed", phase: "delivery", tone: "negative", rank: 98,
    isAttempt: true, isIssue: true,
    description: "Delivery could not be completed." },
  { value: "RESCHEDULED", label: "Rescheduled", phase: "delivery", tone: "warning", rank: 99,
    isIssue: true,
    description: "Booked in for another day." },
  // A successful delivery is the final attempt, so it counts towards the
  // attempt total — "delivered on the third attempt" is three, not two.
  { value: "DELIVERED", label: "Delivered", phase: "closed", tone: "positive", rank: 200,
    isTerminal: true, isAttempt: true,
    description: "Handed over and, for COD, cash collected." },

  { value: "RETURN_REQUESTED", label: "Return requested", phase: "closed", tone: "warning", rank: 150,
    isIssue: true, description: "A return has been raised." },
  { value: "RETURN_IN_TRANSIT", label: "Return in transit", phase: "closed", tone: "warning", rank: 160,
    isIssue: true, description: "On its way back to you." },
  { value: "RETURNED", label: "Returned", phase: "closed", tone: "negative", rank: 210,
    isTerminal: true, description: "Back with you. No revenue." },
  { value: "REFUSED", label: "Refused", phase: "closed", tone: "negative", rank: 205,
    isTerminal: true, isIssue: true, description: "Customer refused the parcel." },
  { value: "CANCELLED", label: "Cancelled", phase: "closed", tone: "neutral", rank: 220,
    isTerminal: true, description: "Cancelled before it went anywhere." },
];

const BY_VALUE = new Map(ORDER_STATUSES.map((status) => [status.value, status]));

export function statusDef(value: string): StatusDefinition {
  return (
    BY_VALUE.get(value as OrderStatus) ?? {
      value: value as OrderStatus,
      label: humanise(value),
      phase: "delivery",
      tone: "neutral",
      rank: 75,
      description: "Reported by the courier.",
    }
  );
}

export function statusLabel(value: string | null | undefined): string {
  return value ? statusDef(value).label : "—";
}

export function isIssueStatus(value: string): boolean {
  return statusDef(value).isIssue === true;
}

export function isTerminalStatus(value: string): boolean {
  return statusDef(value).isTerminal === true;
}

export function isAttemptStatus(value: string): boolean {
  return statusDef(value).isAttempt === true;
}

export function statusRank(value: string): number {
  return statusDef(value).rank;
}

/** Statuses that put an order on the Delivery Issues board. */
export const ISSUE_STATUSES = ORDER_STATUSES.filter((s) => s.isIssue).map((s) => s.value);

/** The happy path, drawn as the timeline rail behind the real events. */
export const HAPPY_PATH: OrderStatus[] = [
  "NEW",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPMENT_CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

/** Cards on the tracking dashboard, in the order they are shown. */
export const DASHBOARD_BUCKETS: {
  key: string;
  label: string;
  statuses: OrderStatus[];
  tone: StatusTone;
}[] = [
  { key: "NEW", label: "New", statuses: ["NEW"], tone: "neutral" },
  { key: "CONFIRMED", label: "Confirmed", statuses: ["CONFIRMED", "PROCESSING"], tone: "info" },
  { key: "READY_TO_SHIP", label: "Ready to ship", statuses: ["READY_TO_SHIP"], tone: "brand" },
  { key: "SHIPMENT_CREATED", label: "Shipment created", statuses: ["SHIPMENT_CREATED"], tone: "info" },
  { key: "PICKED_UP", label: "Picked up", statuses: ["PICKED_UP"], tone: "info" },
  { key: "IN_TRANSIT", label: "In transit", statuses: ["IN_TRANSIT", "ARRIVED_AT_DESTINATION"], tone: "info" },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery", statuses: ["OUT_FOR_DELIVERY"], tone: "warning" },
  { key: "ATTEMPTED", label: "Attempted", statuses: ["DELIVERY_ATTEMPTED", "RESCHEDULED"], tone: "warning" },
  { key: "NOT_HOME", label: "Customer not home", statuses: ["CUSTOMER_NOT_HOME", "CUSTOMER_UNAVAILABLE"], tone: "warning" },
  { key: "FAILED", label: "Delivery failed", statuses: ["DELIVERY_FAILED", "REFUSED"], tone: "negative" },
  { key: "DELIVERED", label: "Delivered", statuses: ["DELIVERED"], tone: "positive" },
  { key: "RETURNED", label: "Returned", statuses: ["RETURNED", "RETURN_IN_TRANSIT", "RETURN_REQUESTED"], tone: "negative" },
  { key: "CANCELLED", label: "Cancelled", statuses: ["CANCELLED"], tone: "neutral" },
];

export function bucketFor(key: string): OrderStatus[] {
  return DASHBOARD_BUCKETS.find((bucket) => bucket.key === key)?.statuses ?? [];
}

function humanise(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
