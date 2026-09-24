import {
  ADDRESS_FIELDS,
  MONEY_FIELDS,
  type RawAddress,
  type RawMoney,
  type RawMoneyBag,
  type RawPageInfo,
} from "./fragments";

/**
 * Requires `read_orders`.
 *
 * Shopify only returns the last 60 days of orders unless the app also holds
 * `read_all_orders`, so anything reaching further back needs that scope too.
 */

const ORDER_FIELDS = `
  fragment OrderFields on Order {
    id
    legacyResourceId
    name
    number
    createdAt
    updatedAt
    processedAt
    cancelledAt
    closedAt
    displayFinancialStatus
    displayFulfillmentStatus
    email
    phone
    note
    tags
    currencyCode
    customer {
      id
      firstName
      lastName
      displayName
      defaultEmailAddress { emailAddress }
      defaultPhoneNumber { phoneNumber }
    }
    shippingAddress { ...AddressFields }
    billingAddress { ...AddressFields }
    discountApplications(first: 10) {
      nodes {
        allocationMethod
        targetType
        value {
          ... on MoneyV2 { ...MoneyFields }
          ... on PricingPercentageValue { percentage }
        }
        ... on DiscountCodeApplication { code }
      }
    }
    subtotalPriceSet { shopMoney { ...MoneyFields } }
    currentTotalDiscountsSet { shopMoney { ...MoneyFields } }
    totalShippingPriceSet { shopMoney { ...MoneyFields } }
    totalTaxSet { shopMoney { ...MoneyFields } }
    totalRefundedSet { shopMoney { ...MoneyFields } }
    currentTotalPriceSet { shopMoney { ...MoneyFields } }
    fulfillments(first: 20) {
      id
      status
      createdAt
      trackingInfo { number company url }
    }
    lineItems(first: 100) {
      nodes {
        id
        title
        variantTitle
        sku
        quantity
        refundableQuantity
        originalUnitPriceSet { shopMoney { ...MoneyFields } }
        originalTotalSet { shopMoney { ...MoneyFields } }
        totalDiscountSet { shopMoney { ...MoneyFields } }
        product { id }
        variant { id }
      }
    }
  }
`;

export const ORDERS_LIST_QUERY = `
  ${MONEY_FIELDS}
  ${ADDRESS_FIELDS}
  ${ORDER_FIELDS}
  query OrdersList($first: Int!, $cursor: String, $query: String) {
    orders(first: $first, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes { ...OrderFields }
    }
  }
`;

export const ORDER_BY_ID_QUERY = `
  ${MONEY_FIELDS}
  ${ADDRESS_FIELDS}
  ${ORDER_FIELDS}
  query OrderById($id: ID!) {
    order(id: $id) { ...OrderFields }
  }
`;

export interface RawOrderLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  refundableQuantity: number | null;
  originalUnitPriceSet: RawMoneyBag | null;
  originalTotalSet: RawMoneyBag | null;
  totalDiscountSet: RawMoneyBag | null;
  product: { id: string } | null;
  variant: { id: string } | null;
}

export interface RawDiscountApplication {
  allocationMethod: string | null;
  targetType: string | null;
  value: (RawMoney & { percentage?: number }) | { percentage: number } | null;
  code?: string | null;
}

export interface RawOrder {
  id: string;
  legacyResourceId: string | null;
  name: string;
  /** Shopify's own sequence number, free of the store's name prefix. */
  number: number | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  closedAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
  tags: string[] | null;
  currencyCode: string;
  customer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    defaultEmailAddress: { emailAddress: string | null } | null;
    defaultPhoneNumber: { phoneNumber: string | null } | null;
  } | null;
  shippingAddress: RawAddress | null;
  billingAddress: RawAddress | null;
  discountApplications: { nodes: RawDiscountApplication[] } | null;
  subtotalPriceSet: RawMoneyBag | null;
  currentTotalDiscountsSet: RawMoneyBag | null;
  totalShippingPriceSet: RawMoneyBag | null;
  totalTaxSet: RawMoneyBag | null;
  totalRefundedSet: RawMoneyBag | null;
  currentTotalPriceSet: RawMoneyBag | null;
  fulfillments:
    | {
        id: string | null;
        status: string | null;
        createdAt: string | null;
        trackingInfo: { number: string | null; company: string | null; url: string | null }[];
      }[]
    | null;
  lineItems: { nodes: RawOrderLineItem[] } | null;
}

export interface OrdersListResponse {
  orders: { pageInfo: RawPageInfo; nodes: RawOrder[] };
}

export interface OrderByIdResponse {
  order: RawOrder | null;
}
