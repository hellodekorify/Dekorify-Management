import {
  ADDRESS_FIELDS,
  MONEY_FIELDS,
  type RawAddress,
  type RawMoney,
  type RawPageInfo,
} from "./fragments";

/**
 * Requires `read_customers`.
 *
 * Customer records are protected data. Nothing here is logged, and the
 * endpoint returns only the fields the application declares it needs.
 *
 * Contact details come from `defaultEmailAddress` / `defaultPhoneNumber`:
 * the flat `Customer.email` and `Customer.phone` are deprecated, because a
 * customer can now hold several of each.
 */

const CUSTOMER_FIELDS = `
  fragment CustomerFields on Customer {
    id
    legacyResourceId
    firstName
    lastName
    displayName
    defaultEmailAddress { emailAddress }
    defaultPhoneNumber { phoneNumber }
    numberOfOrders
    amountSpent { ...MoneyFields }
    tags
    note
    verifiedEmail
    createdAt
    updatedAt
    defaultAddress { ...AddressFields }
  }
`;

export const CUSTOMERS_LIST_QUERY = `
  ${MONEY_FIELDS}
  ${ADDRESS_FIELDS}
  ${CUSTOMER_FIELDS}
  query CustomersList($first: Int!, $cursor: String, $query: String) {
    customers(first: $first, after: $cursor, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes { ...CustomerFields }
    }
  }
`;

export const CUSTOMER_BY_ID_QUERY = `
  ${MONEY_FIELDS}
  ${ADDRESS_FIELDS}
  ${CUSTOMER_FIELDS}
  query CustomerById($id: ID!) {
    customer(id: $id) { ...CustomerFields }
  }
`;

export interface RawCustomer {
  id: string;
  legacyResourceId: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  defaultEmailAddress: { emailAddress: string | null } | null;
  defaultPhoneNumber: { phoneNumber: string | null } | null;
  /** A string in newer API versions, a number in older ones. */
  numberOfOrders: string | number | null;
  amountSpent: RawMoney | null;
  tags: string[] | null;
  note: string | null;
  verifiedEmail: boolean | null;
  createdAt: string;
  updatedAt: string;
  defaultAddress: RawAddress | null;
}

export interface CustomersListResponse {
  customers: { pageInfo: RawPageInfo; nodes: RawCustomer[] };
}

export interface CustomerByIdResponse {
  customer: RawCustomer | null;
}
