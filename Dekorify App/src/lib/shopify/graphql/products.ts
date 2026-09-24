import { IMAGE_FIELDS, MONEY_FIELDS, type RawImage, type RawMoney, type RawPageInfo } from "./fragments";

/** Requires `read_products`. */

const PRODUCT_FIELDS = `
  fragment ProductFields on Product {
    id
    legacyResourceId
    title
    handle
    description
    descriptionHtml
    status
    vendor
    productType
    tags
    totalInventory
    createdAt
    updatedAt
    publishedAt
    featuredImage { ...ImageFields }
    images(first: 20) {
      nodes { ...ImageFields }
    }
    priceRangeV2 {
      minVariantPrice { ...MoneyFields }
      maxVariantPrice { ...MoneyFields }
    }
    variants(first: 100) {
      nodes {
        id
        legacyResourceId
        title
        sku
        barcode
        price
        compareAtPrice
        inventoryQuantity
        availableForSale
        position
        createdAt
        updatedAt
        selectedOptions { name value }
        inventoryItem {
          id
          unitCost { ...MoneyFields }
        }
      }
    }
  }
`;

export const PRODUCTS_LIST_QUERY = `
  ${MONEY_FIELDS}
  ${IMAGE_FIELDS}
  ${PRODUCT_FIELDS}
  query ProductsList($first: Int!, $cursor: String, $query: String) {
    products(first: $first, after: $cursor, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes { ...ProductFields }
    }
  }
`;

export const PRODUCT_BY_ID_QUERY = `
  ${MONEY_FIELDS}
  ${IMAGE_FIELDS}
  ${PRODUCT_FIELDS}
  query ProductById($id: ID!) {
    product(id: $id) { ...ProductFields }
  }
`;

export interface RawProductVariant {
  id: string;
  legacyResourceId: string | null;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean | null;
  position: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  selectedOptions: { name: string; value: string }[];
  inventoryItem: { id: string; unitCost: RawMoney | null } | null;
}

export interface RawProduct {
  id: string;
  legacyResourceId: string | null;
  title: string;
  handle: string;
  description: string | null;
  descriptionHtml: string | null;
  status: string;
  vendor: string | null;
  productType: string | null;
  tags: string[] | null;
  totalInventory: number | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  featuredImage: RawImage | null;
  images: { nodes: RawImage[] } | null;
  priceRangeV2: { minVariantPrice: RawMoney; maxVariantPrice: RawMoney } | null;
  variants: { nodes: RawProductVariant[] } | null;
}

export interface ProductsListResponse {
  products: { pageInfo: RawPageInfo; nodes: RawProduct[] };
}

export interface ProductByIdResponse {
  product: RawProduct | null;
}
