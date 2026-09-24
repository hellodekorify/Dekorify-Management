import { MONEY_FIELDS, type RawMoney, type RawPageInfo } from "./fragments";

/**
 * Requires `read_inventory` for the levels and `read_locations` to name the
 * location each level belongs to.
 *
 * Walking `inventoryItems` directly rather than products means a store with
 * many variants per product still paginates evenly.
 *
 * `variants` is a connection because one inventory item can back more than one
 * variant; the singular `variant` it replaces is deprecated. We take the first,
 * which is the only one for all ordinary catalogues.
 */

const INVENTORY_FIELDS = `
  fragment InventoryFields on InventoryItem {
    id
    sku
    tracked
    unitCost { ...MoneyFields }
    variants(first: 1) {
      nodes {
        id
        title
        product { id title }
      }
    }
    inventoryLevels(first: 20) {
      nodes {
        location { id name }
        quantities(names: ["available", "on_hand", "committed"]) {
          name
          quantity
        }
      }
    }
  }
`;

export const INVENTORY_LIST_QUERY = `
  ${MONEY_FIELDS}
  ${INVENTORY_FIELDS}
  query InventoryList($first: Int!, $cursor: String, $query: String) {
    inventoryItems(first: $first, after: $cursor, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes { ...InventoryFields }
    }
  }
`;

export const LOCATIONS_QUERY = `
  query Locations($first: Int!, $cursor: String) {
    locations(first: $first, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        isActive
        address { city province country }
      }
    }
  }
`;

export interface RawInventoryLevel {
  location: { id: string; name: string } | null;
  quantities: { name: string; quantity: number }[] | null;
}

export interface RawInventoryVariant {
  id: string;
  title: string | null;
  product: { id: string; title: string } | null;
}

export interface RawInventoryItem {
  id: string;
  sku: string | null;
  tracked: boolean;
  unitCost: RawMoney | null;
  variants: { nodes: RawInventoryVariant[] } | null;
  inventoryLevels: { nodes: RawInventoryLevel[] } | null;
}

export interface InventoryListResponse {
  inventoryItems: { pageInfo: RawPageInfo; nodes: RawInventoryItem[] };
}

export interface LocationsResponse {
  locations: {
    pageInfo: RawPageInfo;
    nodes: {
      id: string;
      name: string;
      isActive: boolean;
      address: { city: string | null; province: string | null; country: string | null } | null;
    }[];
  };
}
