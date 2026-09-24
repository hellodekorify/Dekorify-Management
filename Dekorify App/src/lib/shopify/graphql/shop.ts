/** Shop details. Readable with any valid Admin API token — no extra scope. */

export const SHOP_QUERY = `
  query ShopDetails {
    shop {
      id
      name
      myshopifyDomain
      primaryDomain { host }
      contactEmail
      email
      currencyCode
      ianaTimezone
      timezoneOffset
      shopAddress { countryCodeV2 }
      plan { publicDisplayName }
      createdAt
    }
  }
`;

export interface ShopQueryResponse {
  shop: {
    id: string;
    name: string;
    myshopifyDomain: string;
    primaryDomain: { host: string } | null;
    contactEmail: string | null;
    email: string | null;
    currencyCode: string;
    ianaTimezone: string;
    timezoneOffset: string | null;
    shopAddress: { countryCodeV2: string | null } | null;
    plan: { publicDisplayName: string } | null;
    createdAt: string | null;
  };
}
