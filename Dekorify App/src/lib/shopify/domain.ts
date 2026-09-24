/**
 * The shapes our own API returns.
 *
 * Deliberately not Shopify's shapes: no `gid://` strings where a plain id will
 * do, no `shopMoney { amount }` nesting, no connection wrappers. A consumer of
 * this API should not have to learn Shopify's schema to read a price.
 *
 * Money stays a decimal *string* with its currency alongside. Converting to a
 * float here would undo the care the rest of this app takes with money; the
 * caller decides how to parse it.
 */

export interface Money {
  amount: string;
  currency: string;
}

export interface Address {
  name: string | null;
  company: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zip: string | null;
  country: string | null;
  countryCode: string | null;
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export interface Shop {
  id: string;
  name: string;
  domain: string | null;
  myshopifyDomain: string;
  email: string | null;
  currency: string;
  timezone: string;
  /** IANA offset string, e.g. "+05:00". */
  timezoneOffset: string | null;
  countryCode: string | null;
  planName: string | null;
  createdAt: string | null;
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export interface ProductImage {
  id: string | null;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface ProductVariant {
  id: string;
  legacyId: string | null;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: Money;
  compareAtPrice: Money | null;
  inventoryQuantity: number | null;
  inventoryItemId: string | null;
  /** Unit cost, only present when the merchant has entered it in Shopify. */
  unitCost: Money | null;
  position: number | null;
  availableForSale: boolean | null;
  selectedOptions: { name: string; value: string }[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Product {
  id: string;
  legacyId: string | null;
  title: string;
  handle: string;
  description: string | null;
  descriptionHtml: string | null;
  status: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  totalInventory: number | null;
  featuredImage: ProductImage | null;
  images: ProductImage[];
  variants: ProductVariant[];
  /** Convenience rollups taken from the variants. */
  priceRange: { min: Money; max: Money } | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

export interface OrderLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  refundedQuantity: number | null;
  unitPrice: Money | null;
  totalPrice: Money | null;
  totalDiscount: Money | null;
  productId: string | null;
  variantId: string | null;
}

export interface OrderCustomerSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
}

export interface OrderDiscount {
  code: string | null;
  type: string | null;
  /** Money off. Null when the discount is expressed as a percentage. */
  amount: Money | null;
  /** Percentage off, 0–100. Null when the discount is a fixed amount. */
  percentage: number | null;
}

export interface OrderFulfillment {
  id: string | null;
  status: string | null;
  createdAt: string | null;
  trackingNumbers: string[];
  trackingCompany: string | null;
  trackingUrls: string[];
}

export interface Order {
  id: string;
  legacyId: string | null;
  /** The merchant-facing reference, e.g. "#1001". */
  name: string;
  orderNumber: number | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  closedAt: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  customer: OrderCustomerSummary | null;
  email: string | null;
  phone: string | null;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  lineItems: OrderLineItem[];
  discounts: OrderDiscount[];
  subtotalPrice: Money | null;
  totalDiscounts: Money | null;
  totalShipping: Money | null;
  totalTax: Money | null;
  totalRefunded: Money | null;
  totalPrice: Money | null;
  currency: string;
  fulfillments: OrderFulfillment[];
  tags: string[];
  note: string | null;
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export interface Customer {
  id: string;
  legacyId: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  numberOfOrders: number;
  totalSpent: Money | null;
  tags: string[];
  note: string | null;
  verifiedEmail: boolean | null;
  defaultAddress: Address | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface InventoryLocationLevel {
  locationId: string;
  locationName: string;
  available: number | null;
  onHand: number | null;
  committed: number | null;
}

export interface InventoryItem {
  inventoryItemId: string;
  sku: string | null;
  tracked: boolean;
  unitCost: Money | null;
  variantId: string | null;
  variantTitle: string | null;
  productId: string | null;
  productTitle: string | null;
  /** Total available across every location. */
  totalAvailable: number | null;
  locations: InventoryLocationLevel[];
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export interface Collection {
  id: string;
  legacyId: string | null;
  title: string;
  handle: string;
  description: string | null;
  /** "SMART" for rule-based collections, "CUSTOM" for hand-picked ones. */
  type: "SMART" | "CUSTOM";
  productsCount: number | null;
  image: ProductImage | null;
  updatedAt: string | null;
}
