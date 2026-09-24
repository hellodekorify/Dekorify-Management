/**
 * Checks the Shopify transform layer against payloads captured from the live
 * Dekorify store on the 2026-07 Admin API.
 *
 * These are real shapes, not invented ones, so the fixtures below are the
 * record of what Shopify actually returns — including the awkward parts: an
 * order name carrying a store prefix, a customer with no phone, an inventory
 * item whose available count is zero while three units sit committed.
 *
 *   npm run test:shopify
 */

import {
  toCollection,
  toCustomer,
  toInventoryItem,
  toOrder,
  toProduct,
  toShop,
} from "../src/lib/shopify/transform";

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok    ${label} = ${a}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}: got ${a}, expected ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

console.log("SHOP");
const shop = toShop({
  shop: {
    id: "gid://shopify/Shop/68699488512",
    name: "Dekorify",
    myshopifyDomain: "1bf2ca-2.myshopify.com",
    primaryDomain: { host: "dekorify.com" },
    contactEmail: "hello@dekorify.com",
    email: "owner@example.com",
    currencyCode: "PKR",
    ianaTimezone: "Asia/Karachi",
    timezoneOffset: "+0500",
    shopAddress: { countryCodeV2: "PK" },
    plan: { publicDisplayName: "Basic" },
    createdAt: "2024-01-29T14:15:28Z",
  },
} as never);
check("domain prefers primaryDomain", shop.domain, "dekorify.com");
check("countryCode from shopAddress", shop.countryCode, "PK");
check("planName from publicDisplayName", shop.planName, "Basic");
check("currency", shop.currency, "PKR");
check("timezone", shop.timezone, "Asia/Karachi");

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

const baseOrder = {
  id: "gid://shopify/Order/7201484374272",
  legacyResourceId: "7201484374272",
  name: "#DK-0926-7738",
  number: 7738,
  createdAt: "2026-09-20T19:28:24Z",
  updatedAt: "2026-09-20T19:28:25Z",
  processedAt: "2026-09-20T19:28:22Z",
  cancelledAt: null,
  closedAt: null,
  displayFinancialStatus: "PENDING",
  displayFulfillmentStatus: "UNFULFILLED",
  email: "buyer@example.com",
  phone: null,
  note: null,
  tags: [],
  currencyCode: "PKR",
  customer: {
    id: "gid://shopify/Customer/10259467763968",
    firstName: "A",
    lastName: "B",
    displayName: "A B",
    defaultEmailAddress: { emailAddress: "buyer@example.com" },
    defaultPhoneNumber: null,
  },
  shippingAddress: null,
  billingAddress: null,
  discountApplications: { nodes: [] },
  subtotalPriceSet: { shopMoney: { amount: "2999.0", currencyCode: "PKR" } },
  currentTotalDiscountsSet: { shopMoney: { amount: "0.0", currencyCode: "PKR" } },
  totalShippingPriceSet: { shopMoney: { amount: "300.0", currencyCode: "PKR" } },
  totalTaxSet: { shopMoney: { amount: "0.0", currencyCode: "PKR" } },
  totalRefundedSet: { shopMoney: { amount: "0.0", currencyCode: "PKR" } },
  currentTotalPriceSet: { shopMoney: { amount: "3299.0", currencyCode: "PKR" } },
  fulfillments: [],
  lineItems: {
    nodes: [
      {
        id: "gid://shopify/LineItem/16940088164608",
        title: "Up & Down Hydroponic Planter",
        variantTitle: null,
        sku: "UD - GV - 2",
        quantity: 1,
        refundableQuantity: 1,
        originalUnitPriceSet: { shopMoney: { amount: "2999.0", currencyCode: "PKR" } },
        originalTotalSet: { shopMoney: { amount: "2999.0", currencyCode: "PKR" } },
        totalDiscountSet: { shopMoney: { amount: "0.0", currencyCode: "PKR" } },
        product: { id: "gid://shopify/Product/8818438045952" },
        variant: { id: "gid://shopify/ProductVariant/45788110455040" },
      },
    ],
  },
};

console.log("\nORDER — store-prefixed name");
const prefixed = toOrder(baseOrder as never);
check("name kept verbatim", prefixed.name, "#DK-0926-7738");
// Deriving this from `name` by stripping non-digits yields 9267738.
check("orderNumber from Order.number", prefixed.orderNumber, 7738);
check("customer email via defaultEmailAddress", prefixed.customer?.email, "buyer@example.com");
check("absent phone is null, not undefined", prefixed.customer?.phone, null);
check("line item count", prefixed.lineItems.length, 1);
check("shipping", prefixed.totalShipping?.amount, "300.0");

console.log("\nORDER — legacy name with no prefix");
const legacy = toOrder({ ...baseOrder, name: "#1001", number: 1001 } as never);
check("orderNumber", legacy.orderNumber, 1001);

console.log("\nORDER — percentage discount and courier tracking");
const discounted = toOrder({
  ...baseOrder,
  name: "#DK-0926-7730",
  number: 7730,
  discountApplications: {
    nodes: [
      {
        allocationMethod: "EACH",
        targetType: "LINE_ITEM",
        value: { percentage: 100 },
        code: "Replacement",
      },
    ],
  },
  fulfillments: [
    {
      id: "gid://shopify/Fulfillment/6416651550976",
      status: "SUCCESS",
      createdAt: "2026-09-19T08:45:30Z",
      trackingInfo: [
        {
          number: "LE7544278335",
          company: "Leopards",
          url: "https://leopardsfulfillment.leopardscourier.com/Track/Index?Cn=LE7544278335",
        },
      ],
    },
  ],
} as never);
check("discount code", discounted.discounts[0]?.code, "Replacement");
check("discount percentage is a number", discounted.discounts[0]?.percentage, 100);
check("percentage discount carries no amount", discounted.discounts[0]?.amount, null);
check("tracking number", discounted.fulfillments[0]?.trackingNumbers[0], "LE7544278335");
check("fulfilment status", discounted.fulfillments[0]?.status, "SUCCESS");

console.log("\nORDER — fixed-amount discount");
const fixedOff = toOrder({
  ...baseOrder,
  discountApplications: {
    nodes: [
      {
        allocationMethod: "ACROSS",
        targetType: "LINE_ITEM",
        value: { amount: "500.0", currencyCode: "PKR" },
        code: "SAVE500",
      },
    ],
  },
} as never);
check("amount discount value", fixedOff.discounts[0]?.amount?.amount, "500.0");
check("amount discount carries no percentage", fixedOff.discounts[0]?.percentage, null);

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

console.log("\nCUSTOMER");
const customer = toCustomer({
  id: "gid://shopify/Customer/10259467763968",
  legacyResourceId: "10259467763968",
  firstName: "A",
  lastName: "B",
  displayName: "A B",
  defaultEmailAddress: { emailAddress: "buyer@example.com" },
  defaultPhoneNumber: null,
  // Shopify returns this as a string.
  numberOfOrders: "1",
  amountSpent: { amount: "3299.0", currencyCode: "PKR" },
  tags: [],
  note: null,
  verifiedEmail: true,
  createdAt: "2026-09-20T19:28:23Z",
  updatedAt: "2026-09-20T19:28:25Z",
  defaultAddress: null,
} as never);
check("numberOfOrders coerced to number", customer.numberOfOrders, 1);
check("email via defaultEmailAddress", customer.email, "buyer@example.com");
check("absent phone is null", customer.phone, null);
check("totalSpent", customer.totalSpent?.amount, "3299.0");

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

console.log("\nINVENTORY");
const inventory = toInventoryItem({
  id: "gid://shopify/InventoryItem/46450522325248",
  sku: "HGV - 3",
  tracked: true,
  unitCost: { amount: "1029.0", currencyCode: "PKR" },
  variants: {
    nodes: [
      {
        id: "gid://shopify/ProductVariant/44347062812928",
        title: "Three Glass",
        product: {
          id: "gid://shopify/Product/8386543976704",
          title: "Hydroponic Plant Glass Vase",
        },
      },
    ],
  },
  inventoryLevels: {
    nodes: [
      {
        location: { id: "gid://shopify/Location/74084811008", name: "Dekorify" },
        quantities: [
          { name: "available", quantity: 0 },
          { name: "on_hand", quantity: 3 },
          { name: "committed", quantity: 3 },
        ],
      },
    ],
  },
} as never);
check("variantTitle via variants connection", inventory.variantTitle, "Three Glass");
check("productTitle", inventory.productTitle, "Hydroponic Plant Glass Vase");
check("available", inventory.totalAvailable, 0);
check("on hand differs from available", inventory.locations[0]?.onHand, 3);
check("committed", inventory.locations[0]?.committed, 3);
check("unitCost", inventory.unitCost?.amount, "1029.0");

const untracked = toInventoryItem({
  id: "gid://shopify/InventoryItem/1",
  sku: null,
  tracked: false,
  unitCost: null,
  variants: { nodes: [] },
  inventoryLevels: { nodes: [] },
} as never);
// No stock figure is not the same as a stock figure of zero.
check("untracked availability is null", untracked.totalAvailable, null);
check("missing variant is null-safe", untracked.variantId, null);

const multiLocation = toInventoryItem({
  id: "gid://shopify/InventoryItem/2",
  sku: "MULTI",
  tracked: true,
  unitCost: null,
  variants: { nodes: [] },
  inventoryLevels: {
    nodes: [
      {
        location: { id: "gid://shopify/Location/1", name: "Warehouse" },
        quantities: [{ name: "available", quantity: 7 }],
      },
      {
        location: { id: "gid://shopify/Location/2", name: "Shop floor" },
        quantities: [{ name: "available", quantity: 5 }],
      },
    ],
  },
} as never);
check("availability summed across locations", multiLocation.totalAvailable, 12);
check("locations listed individually", multiLocation.locations.length, 2);

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

console.log("\nCOLLECTION");
const custom = toCollection({
  id: "gid://shopify/Collection/465496244480",
  legacyResourceId: "465496244480",
  title: "Table Scape",
  handle: "table-scape",
  description: "",
  updatedAt: "2026-09-20T11:17:55Z",
  productsCount: { count: 5 },
  ruleSet: null,
  image: null,
} as never);
check("productsCount unwrapped", custom.productsCount, 5);
check("no ruleSet means CUSTOM", custom.type, "CUSTOM");

const smart = toCollection({
  id: "gid://shopify/Collection/1",
  legacyResourceId: "1",
  title: "On sale",
  handle: "on-sale",
  description: "",
  updatedAt: "2026-09-20T11:17:55Z",
  productsCount: { count: 12 },
  ruleSet: { appliedDisjunctively: true },
  image: null,
} as never);
check("ruleSet means SMART", smart.type, "SMART");

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

console.log("\nPRODUCT");
const product = toProduct(
  {
    id: "gid://shopify/Product/8818438045952",
    legacyResourceId: "8818438045952",
    title: "Up & Down Hydroponic Planter",
    handle: "plant-terrarium-wooden-stand-hydroponic-planter-bulb-glass",
    description: null,
    descriptionHtml: null,
    status: "ACTIVE",
    vendor: "Dekorify",
    productType: "",
    tags: ["artificial plant", "featured product"],
    totalInventory: 21,
    createdAt: "2024-08-05T14:00:40Z",
    updatedAt: "2026-09-20T19:28:38Z",
    publishedAt: "2024-08-05T14:33:30Z",
    featuredImage: null,
    images: { nodes: [] },
    priceRangeV2: {
      minVariantPrice: { amount: "2999.0", currencyCode: "PKR" },
      maxVariantPrice: { amount: "3999.0", currencyCode: "PKR" },
    },
    variants: {
      nodes: [
        {
          id: "gid://shopify/ProductVariant/45788110455040",
          legacyResourceId: "45788110455040",
          title: "Default Title",
          sku: "UD - GV - 2",
          barcode: null,
          price: "2999.00",
          compareAtPrice: "3999.00",
          inventoryQuantity: 21,
          availableForSale: true,
          position: 2,
          createdAt: null,
          updatedAt: null,
          selectedOptions: [{ name: "Title", value: "Default Title" }],
          inventoryItem: {
            id: "gid://shopify/InventoryItem/47892529381632",
            unitCost: { amount: "995.0", currencyCode: "PKR" },
          },
        },
      ],
    },
  } as never,
  "PKR",
);
check("legacyId", product.legacyId, "8818438045952");
check("tags", product.tags.length, 2);
check("variant price", product.variants[0]?.price?.amount, "2999.00");
check("compareAtPrice", product.variants[0]?.compareAtPrice?.amount, "3999.00");
check("unitCost", product.variants[0]?.unitCost?.amount, "995.0");
// Shopify returns bare variant prices with no currency of their own.
check("currency inherited by bare price", product.variants[0]?.price?.currency, "PKR");
check("price range low", product.priceRange?.min?.amount, "2999.0");
check("price range high", product.priceRange?.max?.amount, "3999.0");

const rule = "=".repeat(52);
console.log(`\n${rule}\n  passed ${pass}   failed ${fail}\n${rule}`);
process.exit(fail === 0 ? 0 : 1);
