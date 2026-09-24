/**
 * Shared GraphQL fragments.
 *
 * Kept in one place so the field set behind a money value or an address is
 * identical everywhere, and a schema change is a single edit.
 */

export const MONEY_FIELDS = `
  fragment MoneyFields on MoneyV2 {
    amount
    currencyCode
  }
`;

export const ADDRESS_FIELDS = `
  fragment AddressFields on MailingAddress {
    name
    company
    phone
    address1
    address2
    city
    province
    provinceCode
    zip
    country
    countryCodeV2
  }
`;

export const IMAGE_FIELDS = `
  fragment ImageFields on Image {
    id
    url
    altText
    width
    height
  }
`;

export const PAGE_INFO = `
  fragment PageInfoFields on PageInfo {
    hasNextPage
    endCursor
  }
`;

/** Raw shapes the fragments above produce, before transformation. */

export interface RawMoney {
  amount: string;
  currencyCode: string;
}

export interface RawMoneyBag {
  shopMoney: RawMoney;
}

export interface RawAddress {
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
  countryCodeV2: string | null;
}

export interface RawImage {
  id: string | null;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface RawPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
