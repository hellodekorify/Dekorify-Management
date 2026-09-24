import { ORDER_STATUS, type OrderStatus } from "../orders/statuses";

/**
 * Leopards status wording mapped to our internal lifecycle.
 *
 * Seeded into CourierStatusMapping when a courier is created, and editable
 * from Settings afterwards — couriers reword their statuses without notice,
 * and a mapping the owner can fix beats one only a developer can.
 *
 * Matching is done on the lower-cased courier text: exact first, then a
 * contains-match against these keys. An unmatched status is still recorded on
 * the timeline with its original wording; it just does not move the order.
 */
export interface DefaultMapping {
  courierStatus: string;
  internalStatus: OrderStatus;
  isIssue?: boolean;
  isAttempt?: boolean;
  isTerminal?: boolean;
}

export const LEOPARDS_DEFAULT_MAPPINGS: DefaultMapping[] = [
  // --- Booking and pickup ---------------------------------------------------
  { courierStatus: "consignment booked", internalStatus: ORDER_STATUS.SHIPMENT_CREATED },
  { courierStatus: "shipment booked", internalStatus: ORDER_STATUS.SHIPMENT_CREATED },
  { courierStatus: "booked", internalStatus: ORDER_STATUS.SHIPMENT_CREATED },
  { courierStatus: "pending pickup", internalStatus: ORDER_STATUS.SHIPMENT_CREATED },
  { courierStatus: "assigned to courier", internalStatus: ORDER_STATUS.SHIPMENT_CREATED },

  { courierStatus: "shipment picked up", internalStatus: ORDER_STATUS.PICKED_UP },
  { courierStatus: "picked up", internalStatus: ORDER_STATUS.PICKED_UP },
  { courierStatus: "pickup done", internalStatus: ORDER_STATUS.PICKED_UP },
  { courierStatus: "received at origin", internalStatus: ORDER_STATUS.PICKED_UP },

  // --- Movement -------------------------------------------------------------
  { courierStatus: "in transit", internalStatus: ORDER_STATUS.IN_TRANSIT },
  { courierStatus: "on the way", internalStatus: ORDER_STATUS.IN_TRANSIT },
  { courierStatus: "dispatched", internalStatus: ORDER_STATUS.IN_TRANSIT },
  { courierStatus: "forwarded", internalStatus: ORDER_STATUS.IN_TRANSIT },
  { courierStatus: "departed from origin", internalStatus: ORDER_STATUS.IN_TRANSIT },
  { courierStatus: "shipment in transit", internalStatus: ORDER_STATUS.IN_TRANSIT },

  { courierStatus: "arrived at destination", internalStatus: ORDER_STATUS.ARRIVED_AT_DESTINATION },
  { courierStatus: "arrived at station", internalStatus: ORDER_STATUS.ARRIVED_AT_DESTINATION },
  { courierStatus: "received at destination", internalStatus: ORDER_STATUS.ARRIVED_AT_DESTINATION },
  { courierStatus: "at destination hub", internalStatus: ORDER_STATUS.ARRIVED_AT_DESTINATION },

  { courierStatus: "out for delivery", internalStatus: ORDER_STATUS.OUT_FOR_DELIVERY },
  { courierStatus: "assigned for delivery", internalStatus: ORDER_STATUS.OUT_FOR_DELIVERY },
  { courierStatus: "with courier", internalStatus: ORDER_STATUS.OUT_FOR_DELIVERY },

  // --- Problems -------------------------------------------------------------
  {
    courierStatus: "customer not available",
    internalStatus: ORDER_STATUS.CUSTOMER_NOT_HOME,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "consignee not available",
    internalStatus: ORDER_STATUS.CUSTOMER_NOT_HOME,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "customer not at home",
    internalStatus: ORDER_STATUS.CUSTOMER_NOT_HOME,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "premises closed",
    internalStatus: ORDER_STATUS.CUSTOMER_NOT_HOME,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "phone not responding",
    internalStatus: ORDER_STATUS.CUSTOMER_UNAVAILABLE,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "no response",
    internalStatus: ORDER_STATUS.CUSTOMER_UNAVAILABLE,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "number incorrect",
    internalStatus: ORDER_STATUS.CUSTOMER_UNAVAILABLE,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "delivery attempted",
    internalStatus: ORDER_STATUS.DELIVERY_ATTEMPTED,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "attempted",
    internalStatus: ORDER_STATUS.DELIVERY_ATTEMPTED,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "incorrect address",
    internalStatus: ORDER_STATUS.DELIVERY_FAILED,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "address not found",
    internalStatus: ORDER_STATUS.DELIVERY_FAILED,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "delivery failed",
    internalStatus: ORDER_STATUS.DELIVERY_FAILED,
    isIssue: true,
    isAttempt: true,
  },
  {
    courierStatus: "undelivered",
    internalStatus: ORDER_STATUS.DELIVERY_FAILED,
    isIssue: true,
    isAttempt: true,
  },
  { courierStatus: "rescheduled", internalStatus: ORDER_STATUS.RESCHEDULED, isIssue: true },
  { courierStatus: "delivery rescheduled", internalStatus: ORDER_STATUS.RESCHEDULED, isIssue: true },
  { courierStatus: "shipment held", internalStatus: ORDER_STATUS.RESCHEDULED, isIssue: true },
  { courierStatus: "on hold", internalStatus: ORDER_STATUS.RESCHEDULED, isIssue: true },

  // --- Endings --------------------------------------------------------------
  {
    courierStatus: "delivered",
    internalStatus: ORDER_STATUS.DELIVERED,
    isTerminal: true,
    isAttempt: true,
  },
  {
    courierStatus: "shipment delivered",
    internalStatus: ORDER_STATUS.DELIVERED,
    isTerminal: true,
    isAttempt: true,
  },
  {
    courierStatus: "delivered to consignee",
    internalStatus: ORDER_STATUS.DELIVERED,
    isTerminal: true,
    isAttempt: true,
  },

  {
    courierStatus: "refused by customer",
    internalStatus: ORDER_STATUS.REFUSED,
    isIssue: true,
    isTerminal: true,
    isAttempt: true,
  },
  {
    courierStatus: "customer refused",
    internalStatus: ORDER_STATUS.REFUSED,
    isIssue: true,
    isTerminal: true,
    isAttempt: true,
  },

  { courierStatus: "return to shipper", internalStatus: ORDER_STATUS.RETURN_IN_TRANSIT, isIssue: true },
  { courierStatus: "return in transit", internalStatus: ORDER_STATUS.RETURN_IN_TRANSIT, isIssue: true },
  { courierStatus: "rto", internalStatus: ORDER_STATUS.RETURN_IN_TRANSIT, isIssue: true },
  { courierStatus: "returned to origin", internalStatus: ORDER_STATUS.RETURNED, isTerminal: true },
  { courierStatus: "returned to shipper", internalStatus: ORDER_STATUS.RETURNED, isTerminal: true },
  { courierStatus: "returned", internalStatus: ORDER_STATUS.RETURNED, isTerminal: true },

  { courierStatus: "cancelled", internalStatus: ORDER_STATUS.CANCELLED, isTerminal: true },
  { courierStatus: "shipment cancelled", internalStatus: ORDER_STATUS.CANCELLED, isTerminal: true },
];

export interface ResolvedMapping {
  internalStatus: string;
  isIssue: boolean;
  isAttempt: boolean;
  isTerminal: boolean;
  matched: boolean;
}

/**
 * Resolve a courier status against the store's configured mappings.
 *
 * Exact match wins; otherwise the longest contained key wins, so
 * "delivery failed - customer not available" prefers the more specific entry
 * rather than whichever happened to be checked first.
 */
export function resolveCourierStatus(
  courierStatus: string,
  mappings: {
    courierStatus: string;
    internalStatus: string;
    isIssue: boolean;
    isAttempt: boolean;
    isTerminal: boolean;
  }[],
): ResolvedMapping {
  const needle = courierStatus.trim().toLowerCase();

  const exact = mappings.find((mapping) => mapping.courierStatus === needle);
  if (exact) {
    return {
      internalStatus: exact.internalStatus,
      isIssue: exact.isIssue,
      isAttempt: exact.isAttempt,
      isTerminal: exact.isTerminal,
      matched: true,
    };
  }

  let best: (typeof mappings)[number] | null = null;
  for (const mapping of mappings) {
    if (needle.includes(mapping.courierStatus)) {
      if (!best || mapping.courierStatus.length > best.courierStatus.length) best = mapping;
    }
  }

  if (best) {
    return {
      internalStatus: best.internalStatus,
      isIssue: best.isIssue,
      isAttempt: best.isAttempt,
      isTerminal: best.isTerminal,
      matched: true,
    };
  }

  // Unknown wording: keep it on the timeline, but do not move the order.
  return {
    internalStatus: ORDER_STATUS.IN_TRANSIT,
    isIssue: false,
    isAttempt: false,
    isTerminal: false,
    matched: false,
  };
}
