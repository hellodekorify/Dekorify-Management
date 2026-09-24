import type { ImportTarget } from "../constants";

export type FieldType = "date" | "text" | "money" | "number" | "enum";

export interface ImportField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  /** Header spellings seen in real Shopify, Meta and bank exports. */
  aliases: string[];
  options?: string[];
}

const DATE_ALIASES = ["date", "transactiondate", "orderdate", "createdat", "created", "day", "postingdate", "day1"];
const AMOUNT_ALIASES = ["amount", "total", "value", "cost", "price", "spend", "amountspent"];

export const IMPORT_FIELDS: Record<ImportTarget, ImportField[]> = {
  SALE: [
    {
      key: "date",
      label: "Order date",
      type: "date",
      required: true,
      aliases: [...DATE_ALIASES, "orderdate", "paidat", "processedat"],
    },
    {
      key: "orderId",
      label: "Order reference",
      type: "text",
      required: true,
      hint: "Must be unique. Used to spot orders you have already imported.",
      aliases: ["orderid", "order", "ordernumber", "orderno", "name", "reference", "orderref", "id", "ordername"],
    },
    { key: "customerName", label: "Customer name", type: "text", aliases: ["customer", "customername", "buyer", "billingname", "shippingname", "clientname"] },
    { key: "channel", label: "Sales channel", type: "text", aliases: ["channel", "saleschannel", "source", "sourcename", "platform"] },
    { key: "productName", label: "Product", type: "text", aliases: ["product", "productname", "lineitemname", "item", "itemname", "title", "variant"] },
    { key: "sku", label: "SKU", type: "text", aliases: ["sku", "lineitemsku", "productsku", "variantsku", "itemcode"] },
    { key: "quantity", label: "Quantity", type: "number", aliases: ["quantity", "qty", "lineitemquantity", "units", "pieces"] },
    {
      key: "grossAmount",
      label: "Sales amount",
      type: "money",
      required: true,
      hint: "The order value before discounts and refunds.",
      aliases: ["grossamount", "grosssales", "subtotal", "linetotal", "ordersubtotal", "salesamount", "gross", "lineitemprice", "unitprice", ...AMOUNT_ALIASES],
    },
    { key: "discount", label: "Discount", type: "money", aliases: ["discount", "discountamount", "orderdiscount", "discounts", "totaldiscount"] },
    { key: "refund", label: "Refund", type: "money", aliases: ["refund", "refunded", "refundamount", "returnamount", "totalrefund"] },
    { key: "shippingRevenue", label: "Shipping charged", type: "money", aliases: ["shipping", "shippingrevenue", "ordershipping", "deliverycharges", "shippingcharged", "freightincome"] },
    { key: "paymentFee", label: "Payment fee", type: "money", aliases: ["paymentfee", "processingfee", "gatewayfee", "transactionfee", "fee", "fees"] },
    { key: "currency", label: "Currency", type: "text", aliases: ["currency", "currencycode", "ccy"] },
    {
      key: "fulfillmentStatus",
      label: "Fulfilment status",
      type: "enum",
      hint: "Cancelled and returned orders are imported but earn no revenue.",
      aliases: ["fulfillmentstatus", "fulfilmentstatus", "status", "orderstatus", "deliverystatus", "shipmentstatus"],
      options: ["FULFILLED", "IN_TRANSIT", "UNFULFILLED", "RETURNED", "CANCELLED"],
    },
    {
      key: "financialStatus",
      label: "Payment status",
      type: "enum",
      aliases: ["financialstatus", "paymentstatus", "paidstatus"],
      options: ["PAID", "PENDING", "PARTIALLY_REFUNDED", "REFUNDED"],
    },
    { key: "notes", label: "Notes", type: "text", aliases: ["notes", "note", "comment", "comments", "remarks", "description"] },
  ],

  EXPENSE: [
    { key: "date", label: "Date", type: "date", required: true, aliases: DATE_ALIASES },
    {
      key: "name",
      label: "Expense name",
      type: "text",
      required: true,
      aliases: ["name", "expense", "expensename", "particulars", "description", "details", "item", "narration", "comments"],
    },
    { key: "amount", label: "Amount", type: "money", required: true, aliases: [...AMOUNT_ALIASES, "debit", "paid", "expenseamount", "outflow"] },
    {
      key: "category",
      label: "Category",
      type: "text",
      hint: "Matched to your existing categories by name. Unknown names can be created on import.",
      aliases: ["category", "expensecategory", "type", "head", "expensehead", "account", "class"],
    },
    { key: "paymentMethod", label: "Payment method", type: "text", aliases: ["paymentmethod", "paidby", "method", "mode", "paymentmode"] },
    { key: "vendorName", label: "Vendor", type: "text", aliases: ["vendor", "vendorname", "supplier", "payee", "paidto", "merchant"] },
    { key: "currency", label: "Currency", type: "text", aliases: ["currency", "currencycode", "ccy"] },
    { key: "description", label: "Description", type: "text", aliases: ["description", "details", "memo", "purpose"] },
    { key: "notes", label: "Notes", type: "text", aliases: ["notes", "note", "remarks", "comment"] },
  ],

  COGS: [
    { key: "date", label: "Date", type: "date", required: true, aliases: [...DATE_ALIASES, "purchasedate", "podate"] },
    {
      key: "productName",
      label: "Product",
      type: "text",
      required: true,
      aliases: ["product", "productname", "item", "itemname", "description", "title", "variations", "variant"],
    },
    { key: "sku", label: "SKU", type: "text", aliases: ["sku", "skus", "productsku", "itemcode", "code", "articleno"] },
    { key: "quantity", label: "Quantity", type: "number", required: true, aliases: ["quantity", "qty", "units", "pieces", "pcs", "received"] },
    {
      key: "unitCost",
      label: "Unit cost",
      type: "money",
      required: true,
      hint: "Total cost is always calculated as quantity × unit cost.",
      aliases: ["unitcost", "cost", "costprice", "rate", "purchaseprice", "landedcost", "buyingprice", "perunit"],
    },
    { key: "supplier", label: "Supplier", type: "text", aliases: ["supplier", "vendor", "suppliername", "sourcedby", "manufacturer"] },
    { key: "currency", label: "Currency", type: "text", aliases: ["currency", "currencycode", "ccy"] },
    { key: "reference", label: "Purchase order / reference", type: "text", aliases: ["reference", "po", "ponumber", "purchaseorder", "invoice", "invoiceno", "billno", "ref"] },
    { key: "notes", label: "Notes", type: "text", aliases: ["notes", "note", "remarks", "comment"] },
  ],

  AD_SPEND: [
    { key: "date", label: "Date", type: "date", required: true, aliases: [...DATE_ALIASES, "reportingstarts", "reportingends", "day"] },
    {
      key: "platform",
      label: "Platform",
      type: "enum",
      required: true,
      aliases: ["platform", "channel", "network", "source", "adnetwork", "publisher"],
      options: ["META", "GOOGLE", "TIKTOK", "AMAZON", "SNAPCHAT", "OTHER"],
    },
    { key: "campaignName", label: "Campaign name", type: "text", aliases: ["campaign", "campaignname", "campaigns", "adset", "adsetname", "adgroup"] },
    { key: "campaignId", label: "Campaign ID", type: "text", aliases: ["campaignid", "campaignidentifier", "adsetid", "id"] },
    {
      key: "amount",
      label: "Amount spent",
      type: "money",
      required: true,
      aliases: ["amountspent", "spend", "cost", "amount", "totalspend", "adspend", "amountspentpkr", "amountspentusd"],
    },
    { key: "currency", label: "Currency", type: "text", aliases: ["currency", "currencycode", "ccy"] },
    { key: "impressions", label: "Impressions", type: "number", aliases: ["impressions", "impr", "views", "reach"] },
    { key: "clicks", label: "Clicks", type: "number", aliases: ["clicks", "linkclicks", "clicksall"] },
    { key: "conversions", label: "Conversions", type: "number", aliases: ["conversions", "purchases", "results", "orders", "websitepurchases"] },
    { key: "notes", label: "Notes", type: "text", aliases: ["notes", "note", "remarks"] },
  ],

  PRODUCT: [
    { key: "name", label: "Product name", type: "text", required: true, aliases: ["name", "product", "productname", "title", "item", "itemname", "variations"] },
    { key: "sku", label: "SKU", type: "text", aliases: ["sku", "skus", "code", "itemcode", "variantsku", "barcode"] },
    { key: "category", label: "Category", type: "text", aliases: ["category", "type", "producttype", "collection", "group"] },
    { key: "sellingPrice", label: "Selling price", type: "money", aliases: ["price", "sellingprice", "retailprice", "mrp", "variantprice", "salesprice"] },
    { key: "unitCost", label: "Unit cost", type: "money", aliases: ["cost", "unitcost", "costprice", "purchaseprice", "costperitem", "landedcost"] },
    { key: "quantityOnHand", label: "Quantity in stock", type: "number", aliases: ["quantity", "qty", "stock", "inventory", "onhand", "variantinventoryqty", "instock"] },
    { key: "supplier", label: "Supplier", type: "text", aliases: ["supplier", "vendor", "suppliername", "sourcedby"] },
    { key: "notes", label: "Notes", type: "text", aliases: ["notes", "note", "remarks", "description"] },
  ],

  SUPPLIER: [
    { key: "name", label: "Supplier name", type: "text", required: true, aliases: ["name", "supplier", "suppliername", "vendor", "vendorname", "company", "companyname"] },
    { key: "contactName", label: "Contact person", type: "text", aliases: ["contact", "contactname", "person", "contactperson", "attention"] },
    { key: "email", label: "Email", type: "text", aliases: ["email", "emailaddress", "mail"] },
    { key: "phone", label: "Phone", type: "text", aliases: ["phone", "phonenumber", "mobile", "contactnumber", "tel", "telephone", "whatsapp"] },
    { key: "address", label: "Address", type: "text", aliases: ["address", "street", "addressline1", "location"] },
    { key: "city", label: "City", type: "text", aliases: ["city", "town"] },
    { key: "country", label: "Country", type: "text", aliases: ["country", "nation"] },
    { key: "notes", label: "Notes", type: "text", aliases: ["notes", "note", "remarks", "comment"] },
  ],
};

/** "Order Total (PKR)" and "order_total" both reduce to "ordertotal". */
export function normaliseHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Best-effort automatic column mapping. Exact alias matches win; a header that
 * merely contains an alias is accepted only when nothing better was found, and
 * a column is never assigned to two fields.
 */
export function autoMap(target: ImportTarget, headers: string[]): Record<string, string> {
  const fields = IMPORT_FIELDS[target];
  const normalised = headers.map((header) => ({ header, key: normaliseHeader(header) }));

  const mapping: Record<string, string> = {};
  const claimed = new Set<string>();

  for (const pass of ["exact", "fuzzy"] as const) {
    for (const field of fields) {
      if (mapping[field.key]) continue;

      const match = normalised.find(({ header, key }) => {
        if (claimed.has(header) || key === "") return false;
        return pass === "exact"
          ? field.aliases.includes(key)
          : field.aliases.some(
              (alias) => alias.length >= 4 && (key.includes(alias) || alias.includes(key)),
            );
      });

      if (match) {
        mapping[field.key] = match.header;
        claimed.add(match.header);
      }
    }
  }

  return mapping;
}

export function fieldsFor(target: ImportTarget): ImportField[] {
  return IMPORT_FIELDS[target];
}
