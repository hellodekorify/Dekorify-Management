import { IMAGE_FIELDS, type RawImage, type RawPageInfo } from "./fragments";

/** Requires `read_products` — Collection sits under the products scope. */

const COLLECTION_FIELDS = `
  fragment CollectionFields on Collection {
    id
    legacyResourceId
    title
    handle
    description
    updatedAt
    productsCount { count }
    ruleSet { appliedDisjunctively }
    image { ...ImageFields }
  }
`;

export const COLLECTIONS_LIST_QUERY = `
  ${IMAGE_FIELDS}
  ${COLLECTION_FIELDS}
  query CollectionsList($first: Int!, $cursor: String, $query: String) {
    collections(first: $first, after: $cursor, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes { ...CollectionFields }
    }
  }
`;

export const COLLECTION_BY_ID_QUERY = `
  ${IMAGE_FIELDS}
  ${COLLECTION_FIELDS}
  query CollectionById($id: ID!) {
    collection(id: $id) { ...CollectionFields }
  }
`;

export interface RawCollection {
  id: string;
  legacyResourceId: string | null;
  title: string;
  handle: string;
  description: string | null;
  updatedAt: string | null;
  productsCount: { count: number } | null;
  /** Present only on smart (rule-based) collections. */
  ruleSet: { appliedDisjunctively: boolean } | null;
  image: RawImage | null;
}

export interface CollectionsListResponse {
  collections: { pageInfo: RawPageInfo; nodes: RawCollection[] };
}

export interface CollectionByIdResponse {
  collection: RawCollection | null;
}
