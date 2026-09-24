import { fromGid } from "./admin";
import type {
  Address,
  Collection,
  Customer,
  InventoryItem,
  InventoryLocationLevel,
  Money,
  Order,
  OrderDiscount,
  OrderFulfillment,
  OrderLineItem,
  Product,
  ProductImage,
  ProductVariant,
  Shop,
} from "./domain";
import type { RawAddress, RawImage, RawMoney, RawMoneyBag } from "./graphql/fragments";
import type { ShopQueryResponse } from "./graphql/shop";
import type { RawProduct, RawProductVariant } from "./graphql/products";
import type { RawDiscountApplication, RawOrder, RawOrderLineItem } from "./graphql/orders";
import type { RawCustomer } from "./graphql/customers";
import type { RawInventoryItem, RawInventoryLevel } from "./graphql/inventory";
import type { RawCollection } from "./graphql/collections";

/**
 * Shopify's shapes → ours.
 *
 * Every mapper is total: a missing or oddly-shaped field becomes null rather
 * than throwing, because one unexpected null from Shopify should not fail a
 * whole page of otherwise good records.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function money(value: RawMoney | null | undefined): Money | null {
  if (!value?.amount) return null;
  return { amount: value.amount, currency: value.currencyCode };
}

function moneyBag(bag: RawMoneyBag | null | undefined): Money | null {
  return money(bag?.shopMoney);
}

/** A bare price string, which Shopify returns without its currency. */
function priceString(value: string | null | undefined, currency: string): Money | null {
  if (value === null || value === undefined || value === "") return null;
  return { amount: value, currency };
}

function address(raw: RawAddress | null | undefined): Address | null {
  if (!raw) return null;
  return {
    name: raw.name,
    company: raw.company,
    phone: raw.phone,
    address1: raw.address1,
    address2: raw.address2,
    city: raw.city,
    province: raw.province,
    provinceCode: raw.provinceCode,
    zip: raw.zip,
    country: raw.country,
    countryCode: raw.countryCodeV2,
  };
}

function image(raw: RawImage | null | undefined): ProductImage | null {
  if (!raw?.url) return null;
  return {
    id: raw.id,
    url: raw.url,
    altText: raw.altText,
    width: raw.width,
    height: raw.height,
  };
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export function toShop(response: ShopQueryResponse): Shop {
  const shop = response.shop;
  return {
    id: shop.id,
    name: shop.name,
    domain: shop.primaryDomain?.host ?? null,
    myshopifyDomain: shop.myshopifyDomain,
    email: shop.contactEmail ?? shop.email ?? null,
    currency: shop.currencyCode,
    timezone: shop.ianaTimezone,
    timezoneOffset: shop.timezoneOffset,
    countryCode: shop.shopAddress?.countryCodeV2 ?? null,
    planName: shop.plan?.publicDisplayName ?? null,
    createdAt: shop.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

function toVariant(raw: RawProductVariant, currency: string): ProductVariant {
  return {
    id: raw.id,
    legacyId: raw.legacyResourceId ?? fromGid(raw.id),
    title: raw.title,
    sku: raw.sku,
    barcode: raw.barcode,
    price: priceString(raw.price, currency) ?? { amount: "0.00", currency },
    compareAtPrice: priceString(raw.compareAtPrice, currency),
    inventoryQuantity: raw.inventoryQuantity,
    inventoryItemId: raw.inventoryItem?.id ?? null,
    unitCost: money(raw.inventoryItem?.unitCost),
    position: raw.position,
    availableForSale: raw.availableForSale,
    selectedOptions: raw.selectedOptions ?? [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function toProduct(raw: RawProduct, shopCurrency: string): Product {
  // Variant prices come back without a currency; the shop's is always correct
  // here because Admin API prices are expressed in the shop's own currency.
  const currency = raw.priceRangeV2?.minVariantPrice.currencyCode ?? shopCurrency;

  const range = raw.priceRangeV2
    ? {
        min: money(raw.priceRangeV2.minVariantPrice)!,
        max: money(raw.priceRangeV2.maxVariantPrice)!,
      }
    : null;

  return {
    id: raw.id,
    legacyId: raw.legacyResourceId ?? fromGid(raw.id),
    title: raw.title,
    handle: raw.handle,
    description: raw.description,
    descriptionHtml: raw.descriptionHtml,
    status: raw.status,
    vendor: raw.vendor,
    productType: raw.productType,
    tags: raw.tags ?? [],
    totalInventory: raw.totalInventory,
    featuredImage: image(raw.featuredImage),
    images: (raw.images?.nodes ?? [])
      .map(image)
      .filter((item): item is ProductImage => item !== null),
    variants: (raw.variants?.nodes ?? []).map((variant) => toVariant(variant, currency)),
    priceRange: range,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    publishedAt: raw.publishedAt,
  };
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

function toLineItem(raw: RawOrderLineItem): OrderLineItem {
  return {
    id: raw.id,
    title: raw.title,
    variantTitle: raw.variantTitle,
    sku: raw.sku,
    quantity: raw.quantity,
    // Shopify reports what *can still* be refunded; the difference is what has been.
    refundedQuantity:
      raw.refundableQuantity === null || raw.refundableQuantity === undefined
        ? null
        : Math.max(0, raw.quantity - raw.refundableQuantity),
    unitPrice: moneyBag(raw.originalUnitPriceSet),
    totalPrice: moneyBag(raw.originalTotalSet),
    totalDiscount: moneyBag(raw.totalDiscountSet),
    productId: raw.product?.id ?? null,
    variantId: raw.variant?.id ?? null,
  };
}

function toDiscount(raw: RawDiscountApplication): OrderDiscount {
  const value = raw.value as (RawMoney & { percentage?: number }) | null;
  const hasAmount = Boolean(value && "amount" in value && value.amount);

  // Shopify's `value` is a union of MoneyV2 and PricingPercentageValue, so a
  // discount is one or the other and never both. Keeping them in separate
  // fields spares every caller from guessing which it received — the previous
  // shape smuggled a percentage through as money under a "PERCENT" currency,
  // which any money formatter would render as nonsense.
  return {
    code: raw.code ?? null,
    type: raw.targetType ?? null,
    amount: hasAmount ? money(value) : null,
    percentage: !hasAmount && typeof value?.percentage === "number" ? value.percentage : null,
  };
}

function toFulfillments(raw: RawOrder["fulfillments"]): OrderFulfillment[] {
  return (raw ?? []).map((fulfillment) => ({
    id: fulfillment.id,
    status: fulfillment.status,
    createdAt: fulfillment.createdAt,
    trackingNumbers: (fulfillment.trackingInfo ?? [])
      .map((info) => info.number)
      .filter((number): number is string => Boolean(number)),
    trackingCompany: fulfillment.trackingInfo?.[0]?.company ?? null,
    trackingUrls: (fulfillment.trackingInfo ?? [])
      .map((info) => info.url)
      .filter((url): url is string => Boolean(url)),
  }));
}

export function toOrder(raw: RawOrder): Order {
  const currency = raw.currencyCode;

  return {
    id: raw.id,
    legacyId: raw.legacyResourceId ?? fromGid(raw.id),
    name: raw.name,
    // Shopify's own sequence number. Never derive this from `name`: a store
    // with an order prefix produces names like "#DK-0926-7738", where
    // stripping non-digits yields 9267738 rather than 7738.
    orderNumber: raw.number ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    processedAt: raw.processedAt,
    cancelledAt: raw.cancelledAt,
    closedAt: raw.closedAt,
    financialStatus: raw.displayFinancialStatus,
    fulfillmentStatus: raw.displayFulfillmentStatus,
    customer: raw.customer
      ? {
          id: raw.customer.id,
          firstName: raw.customer.firstName,
          lastName: raw.customer.lastName,
          displayName: raw.customer.displayName,
          email: raw.customer.defaultEmailAddress?.emailAddress ?? null,
          phone: raw.customer.defaultPhoneNumber?.phoneNumber ?? null,
        }
      : null,
    email: raw.email,
    phone: raw.phone,
    shippingAddress: address(raw.shippingAddress),
    billingAddress: address(raw.billingAddress),
    lineItems: (raw.lineItems?.nodes ?? []).map(toLineItem),
    discounts: (raw.discountApplications?.nodes ?? []).map(toDiscount),
    subtotalPrice: moneyBag(raw.subtotalPriceSet),
    totalDiscounts: moneyBag(raw.currentTotalDiscountsSet),
    totalShipping: moneyBag(raw.totalShippingPriceSet),
    totalTax: moneyBag(raw.totalTaxSet),
    totalRefunded: moneyBag(raw.totalRefundedSet),
    totalPrice: moneyBag(raw.currentTotalPriceSet),
    currency,
    fulfillments: toFulfillments(raw.fulfillments),
    tags: raw.tags ?? [],
    note: raw.note,
  };
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export function toCustomer(raw: RawCustomer): Customer {
  const orders =
    typeof raw.numberOfOrders === "string"
      ? Number.parseInt(raw.numberOfOrders, 10)
      : (raw.numberOfOrders ?? 0);

  return {
    id: raw.id,
    legacyId: raw.legacyResourceId ?? fromGid(raw.id),
    firstName: raw.firstName,
    lastName: raw.lastName,
    displayName: raw.displayName,
    email: raw.defaultEmailAddress?.emailAddress ?? null,
    phone: raw.defaultPhoneNumber?.phoneNumber ?? null,
    numberOfOrders: Number.isFinite(orders) ? orders : 0,
    totalSpent: money(raw.amountSpent),
    tags: raw.tags ?? [],
    note: raw.note,
    verifiedEmail: raw.verifiedEmail,
    defaultAddress: address(raw.defaultAddress),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

function quantityNamed(level: RawInventoryLevel, name: string): number | null {
  const found = (level.quantities ?? []).find((quantity) => quantity.name === name);
  return found ? found.quantity : null;
}

function toLevel(raw: RawInventoryLevel): InventoryLocationLevel | null {
  if (!raw.location) return null;
  return {
    locationId: raw.location.id,
    locationName: raw.location.name,
    available: quantityNamed(raw, "available"),
    onHand: quantityNamed(raw, "on_hand"),
    committed: quantityNamed(raw, "committed"),
  };
}

export function toInventoryItem(raw: RawInventoryItem): InventoryItem {
  const locations = (raw.inventoryLevels?.nodes ?? [])
    .map(toLevel)
    .filter((level): level is InventoryLocationLevel => level !== null);

  const withAvailable = locations.filter((level) => level.available !== null);

  // One inventory item backs a single variant in every ordinary catalogue,
  // but the field is a connection because Shopify permits more than one.
  const variant = raw.variants?.nodes?.[0] ?? null;

  return {
    inventoryItemId: raw.id,
    sku: raw.sku,
    tracked: raw.tracked,
    unitCost: money(raw.unitCost),
    variantId: variant?.id ?? null,
    variantTitle: variant?.title ?? null,
    productId: variant?.product?.id ?? null,
    productTitle: variant?.product?.title ?? null,
    // Null rather than 0 when no location reported a figure — an untracked
    // item has no quantity, which is not the same as having none in stock.
    totalAvailable:
      withAvailable.length === 0
        ? null
        : withAvailable.reduce((total, level) => total + (level.available ?? 0), 0),
    locations,
  };
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export function toCollection(raw: RawCollection): Collection {
  return {
    id: raw.id,
    legacyId: raw.legacyResourceId ?? fromGid(raw.id),
    title: raw.title,
    handle: raw.handle,
    description: raw.description,
    type: raw.ruleSet ? "SMART" : "CUSTOM",
    productsCount: raw.productsCount?.count ?? null,
    image: image(raw.image),
    updatedAt: raw.updatedAt,
  };
}
