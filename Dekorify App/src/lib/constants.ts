/** Where an expense category sits in the profit & loss statement. */
export const CATEGORY_KINDS = {
  FULFILMENT: "FULFILMENT",
  OPERATING: "OPERATING",
  OTHER: "OTHER",
} as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[keyof typeof CATEGORY_KINDS];

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  FULFILMENT: "Fulfilment & delivery",
  OPERATING: "Operating expense",
  OTHER: "Other / below the line",
};

export const CATEGORY_KIND_HELP: Record<CategoryKind, string> = {
  FULFILMENT:
    "A direct cost of getting an order to the customer. Sits above gross profit alongside COGS.",
  OPERATING: "A running cost of the business. Deducted from gross profit to reach net profit.",
  OTHER:
    "Appropriations such as zakat, donations or owner drawings. Shown separately, below net profit.",
};

/**
 * Seeded on every new store. `kind` places each one correctly in the P&L,
 * which is what makes gross profit meaningful rather than a guess.
 */
export const DEFAULT_EXPENSE_CATEGORIES: {
  name: string;
  kind: CategoryKind;
  color: string;
}[] = [
  { name: "Shipping & Courier", kind: "FULFILMENT", color: "#0ea5e9" },
  { name: "Packaging", kind: "FULFILMENT", color: "#06b6d4" },
  { name: "Returns & RTO", kind: "FULFILMENT", color: "#f43f5e" },
  { name: "Payment Gateway Fees", kind: "FULFILMENT", color: "#8b5cf6" },

  { name: "Rent", kind: "OPERATING", color: "#f59e0b" },
  { name: "Salaries & Wages", kind: "OPERATING", color: "#10b981" },
  { name: "Software & Subscriptions", kind: "OPERATING", color: "#6366f1" },
  { name: "Internet", kind: "OPERATING", color: "#3b82f6" },
  { name: "Utilities", kind: "OPERATING", color: "#eab308" },
  { name: "Office Expenses", kind: "OPERATING", color: "#a855f7" },
  { name: "Professional Services", kind: "OPERATING", color: "#14b8a6" },
  { name: "Bank Charges", kind: "OPERATING", color: "#64748b" },
  { name: "Marketing (non-ads)", kind: "OPERATING", color: "#ec4899" },
  { name: "Travel & Transport", kind: "OPERATING", color: "#f97316" },
  { name: "Miscellaneous", kind: "OPERATING", color: "#94a3b8" },

  { name: "Zakat & Donations", kind: "OTHER", color: "#22c55e" },
  { name: "Owner Drawings", kind: "OTHER", color: "#78716c" },
  { name: "Tax", kind: "OTHER", color: "#dc2626" },
];

export const AD_PLATFORMS = [
  { value: "META", label: "Meta Ads", color: "#0866ff" },
  { value: "GOOGLE", label: "Google Ads", color: "#ea4335" },
  { value: "TIKTOK", label: "TikTok Ads", color: "#000000" },
  { value: "AMAZON", label: "Amazon Ads", color: "#ff9900" },
  { value: "SNAPCHAT", label: "Snapchat Ads", color: "#fffc00" },
  { value: "OTHER", label: "Other", color: "#94a3b8" },
] as const;

export type AdPlatform = (typeof AD_PLATFORMS)[number]["value"];

export function adPlatformLabel(value: string): string {
  return AD_PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

export function adPlatformColor(value: string): string {
  return AD_PLATFORMS.find((p) => p.value === value)?.color ?? "#94a3b8";
}

export const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank transfer" },
  { value: "CARD", label: "Card" },
  { value: "JAZZCASH", label: "JazzCash" },
  { value: "EASYPAISA", label: "Easypaisa" },
  { value: "COD", label: "Cash on delivery" },
  { value: "OTHER", label: "Other" },
] as const;

export function paymentMethodLabel(value: string | null): string {
  if (!value) return "—";
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;
}

export const SALES_CHANNELS = [
  "Shopify",
  "Instagram",
  "WhatsApp",
  "Facebook",
  "Wholesale",
  "Walk-in",
  "Other",
] as const;

export const FINANCIAL_STATUSES = [
  { value: "PAID", label: "Paid" },
  { value: "PENDING", label: "Pending" },
  { value: "PARTIALLY_REFUNDED", label: "Partially refunded" },
  { value: "REFUNDED", label: "Refunded" },
] as const;

export const FULFILLMENT_STATUSES = [
  { value: "FULFILLED", label: "Delivered" },
  { value: "IN_TRANSIT", label: "In transit" },
  { value: "UNFULFILLED", label: "Unfulfilled" },
  { value: "RETURNED", label: "Returned (RTO)" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export function fulfillmentLabel(value: string | null): string {
  if (!value) return "—";
  return FULFILLMENT_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export const RECURRING_FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
] as const;

export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number]["value"];

export const CASH_ENTRY_CATEGORIES = [
  { value: "OTHER_INCOME", label: "Other income", direction: "IN" },
  { value: "CAPITAL", label: "Capital injection", direction: "IN" },
  { value: "LOAN", label: "Loan received", direction: "IN" },
  { value: "LOAN_REPAYMENT", label: "Loan repayment", direction: "OUT" },
  { value: "DRAWINGS", label: "Owner drawings", direction: "OUT" },
  { value: "TAX", label: "Tax payment", direction: "OUT" },
  { value: "TRANSFER", label: "Transfer", direction: "OUT" },
  { value: "OTHER", label: "Other", direction: "OUT" },
] as const;

export const CASH_ACCOUNT_TYPES = [
  { value: "BANK", label: "Bank account" },
  { value: "CASH", label: "Cash in hand" },
  { value: "WALLET", label: "Mobile wallet" },
] as const;

/** Entities the CSV/Excel importer can write into. */
export const IMPORT_TARGETS = [
  {
    value: "SALE",
    label: "Sales / Orders",
    description: "Shopify order exports or any revenue list.",
  },
  {
    value: "EXPENSE",
    label: "Expenses",
    description: "Bills, salaries, rent, subscriptions and other running costs.",
  },
  {
    value: "COGS",
    label: "COGS / Purchases",
    description: "Stock purchases and per-unit product costs.",
  },
  {
    value: "AD_SPEND",
    label: "Ad Spend",
    description: "Meta, Google or TikTok billing exports.",
  },
  {
    value: "PRODUCT",
    label: "Products",
    description: "Your catalogue with selling prices and unit costs.",
  },
  {
    value: "SUPPLIER",
    label: "Suppliers",
    description: "Vendor contact list.",
  },
] as const;

export type ImportTarget = (typeof IMPORT_TARGETS)[number]["value"];

export const CHART_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
  "#84cc16",
  "#f97316",
];
