import type { Metadata } from "next";
import { AlertCircle, CheckCircle2, Info, ShoppingBag } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import {
  isShopifyConfigured,
  readShopifyConfig,
  REQUIRED_ADMIN_SCOPES,
} from "@/lib/shopify/config";
import { formatDate } from "@/lib/dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectForm, ConnectedActions, TokenConnectForm } from "./shopify-client";

export const metadata: Metadata = { title: "Shopify" };

const ERROR_MESSAGES: Record<string, string> = {
  not_configured:
    "Shopify credentials are not set. Add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to your .env file and restart the app.",
  invalid_shop:
    "That does not look like a Shopify store domain. It should end in .myshopify.com.",
  state_mismatch:
    "The connection could not be verified. Start again from this page rather than an old link.",
  bad_signature:
    "Shopify's signature did not match. The request may have been tampered with — please try again.",
  missing_code: "Shopify did not return an authorisation code. Please try again.",
  exchange_failed:
    "Shopify accepted the request but the access token could not be retrieved. Check that your app credentials and redirect URL are correct.",
};

export default async function ShopifySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { store } = await requireContext();
  const params = await searchParams;

  const configured = isShopifyConfigured();
  const config = readShopifyConfig();

  const full = await prisma.store.findUniqueOrThrow({
    where: { id: store.id },
    select: {
      shopifyDomain: true,
      shopifyConnectedAt: true,
      shopifyLastSyncAt: true,
      shopifyScope: true,
    },
  });

  const connected = Boolean(full.shopifyDomain);

  const [importedOrders, importedProducts] = await Promise.all([
    prisma.sale.count({ where: { storeId: store.id, deletedAt: null, shopifyOrderGid: { not: null } } }),
    prisma.product.count({
      where: { storeId: store.id, deletedAt: null, shopifyProductGid: { not: null } },
    }),
  ]);

  return (
    <>
      {params.error && (
        <div className="flex items-start gap-3 rounded-xl border border-negative-border bg-negative-soft p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" aria-hidden />
          <p className="text-[13.5px] leading-relaxed text-negative">
            {ERROR_MESSAGES[params.error] ?? "The connection could not be completed."}
          </p>
        </div>
      )}

      {params.connected === "1" && (
        <div className="flex items-start gap-3 rounded-xl border border-positive-border bg-positive-soft p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-positive" aria-hidden />
          <p className="text-[13.5px] leading-relaxed text-positive">
            Connected. Run a sync below to pull in your orders and products.
          </p>
        </div>
      )}

      <Card>
        <CardHeader
          title="Shopify connection"
          description="Pull orders, products, customers, refunds and discounts straight from your store."
          action={
            connected ? (
              <Badge tone="positive" dot>
                Connected
              </Badge>
            ) : (
              <Badge tone="neutral">Not connected</Badge>
            )
          }
        />

        <CardBody className="space-y-5">
          {connected ? (
            <>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail label="Store" value={full.shopifyDomain ?? "—"} />
                <Detail
                  label="Connected"
                  value={full.shopifyConnectedAt ? formatDate(full.shopifyConnectedAt) : "—"}
                />
                <Detail
                  label="Last sync"
                  value={full.shopifyLastSyncAt ? formatDate(full.shopifyLastSyncAt) : "Never"}
                />
                <Detail
                  label="Imported so far"
                  value={`${importedOrders.toLocaleString()} orders · ${importedProducts.toLocaleString()} products`}
                />
              </dl>

              <div className="border-t border-border-subtle pt-5">
                <ConnectedActions domain={full.shopifyDomain ?? ""} />
              </div>
            </>
          ) : (
            <>
              {/* The token route is listed first because it is the one that
                  works without a public HTTPS address. */}
              <div>
                <div className="mb-3">
                  <p className="text-[14px] font-semibold text-foreground">
                    Connect with an access token
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    In your Shopify admin go to{" "}
                    <span className="font-medium text-foreground">
                      Settings → Apps and sales channels → Develop apps
                    </span>
                    , create an app, and give it every Admin API scope below —
                    leaving one out makes the matching endpoint fail with a
                    permission error rather than simply returning less:
                  </p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {REQUIRED_ADMIN_SCOPES.map((scope) => (
                      <code
                        key={scope}
                        className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11.5px]"
                      >
                        {scope}
                      </code>
                    ))}
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">
                    Then install it and copy the Admin API access token — the
                    long value starting <code className="font-mono">shpat_</code>
                    , shown only once. The API key and secret are a different
                    pair of credentials and are not what this form wants.
                  </p>
                </div>
                <TokenConnectForm />
              </div>

              <details className="rounded-xl border border-border-subtle bg-surface-muted p-4">
                <summary className="cursor-pointer text-[13.5px] font-medium text-foreground">
                  Or connect with OAuth (needs a public HTTPS address)
                </summary>

                <div className="mt-4 space-y-4">
                  <p className="text-[13px] leading-relaxed text-muted">
                    Use this only if you are running the app on a real domain. Shopify must be able
                    to redirect back to it, which it cannot do for{" "}
                    <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[11.5px]">
                      localhost
                    </code>
                    .
                  </p>

                  {!configured ? (
                    <div className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-soft p-3.5">
                      <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-warning" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-warning">
                          App credentials not set
                        </p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-warning">
                          Create an app at partners.shopify.com, then add these to{" "}
                          <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[11.5px]">
                            .env
                          </code>{" "}
                          and restart:
                        </p>
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/5 p-3 font-mono text-[11px] leading-relaxed">
{`SHOPIFY_API_KEY="your key"
SHOPIFY_API_SECRET="your secret"
SHOPIFY_APP_URL="https://your-public-domain"`}
                        </pre>
                        <p className="mt-2 text-[12px] leading-relaxed text-warning">
                          Redirect URL to register:{" "}
                          <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[11px]">
                            {config?.appUrl ?? "http://localhost:3000"}/api/shopify/callback
                          </code>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <ConnectForm disabled={false} />
                  )}
                </div>
              </details>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="How the sync works"
          description="What happens when you press Sync now."
        />
        <CardBody>
          <ul className="space-y-3.5">
            {[
              {
                title: "Orders are matched by their Shopify reference",
                body: "Running a sync twice updates the existing rows instead of doubling your revenue. An order edited in Shopify is corrected here on the next sync.",
              },
              {
                title: "Cancelled and returned orders earn nothing",
                body: "They are still imported so you can see them, but they contribute zero revenue — the same rule the rest of the app follows.",
              },
              {
                title: "Only orders since the last sync are fetched",
                body: "With a few days of overlap, so a late edit is not missed. The first sync reaches back a year.",
              },
              {
                title: "Your own product costs are never overwritten",
                body: "Shopify's unit cost is used only where you have not entered one yourself, so your margins stay as you set them.",
              },
              {
                title: "Credentials stay in your environment",
                body: "The API key and secret are read from .env and never stored in the database. Only the per-store access token Shopify issues is saved.",
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-3">
                <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                <div>
                  <p className="text-[13.5px] font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] font-medium break-words text-foreground">{value}</dd>
    </div>
  );
}
