"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, KeyRound, Plug, RefreshCw, Unplug } from "lucide-react";
import {
  connectShopifyWithTokenAction,
  disconnectShopifyAction,
  syncShopifyAction,
} from "@/app/actions/shopify";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Checkbox } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

/**
 * Access-token connection. Works on localhost, where the OAuth redirect cannot
 * reach back, so this is the route most single-store setups actually use.
 */
export function TokenConnectForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    connectShopifyWithTokenAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast({ title: "Shopify connected", description: state.message });
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      {state?.message && !state.ok && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-negative-border bg-negative-soft p-3"
        >
          <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-negative" aria-hidden />
          <p className="text-[13px] leading-snug text-negative">{state.message}</p>
        </div>
      )}

      {/* The example is deliberately not the store's own brand name: a
          myshopify domain is fixed at signup and often bears no resemblance
          to it, so a familiar-looking example invites the wrong answer. The
          real one is in Shopify under Settings → Domains. */}
      <Input
        name="shop"
        label="Your Shopify store domain"
        placeholder="your-store.myshopify.com"
        required
        error={state?.errors?.shop}
        hint="Your .myshopify.com address, not your public domain — find it in Shopify under Settings → Domains."
      />

      <Input
        name="accessToken"
        type="password"
        label="Admin API access token"
        placeholder="shpat_…"
        required
        error={state?.errors?.accessToken}
        hint="From your store's custom app, under API credentials. Shown once, so copy it carefully."
      />

      <Button type="submit" loading={pending}>
        <KeyRound className="h-4 w-4" aria-hidden />
        Connect with token
      </Button>
    </form>
  );
}

export function ConnectForm({ disabled }: { disabled: boolean }) {
  const [shop, setShop] = useState("");
  const clean = shop.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  return (
    <form action="/api/shopify/install" method="get" className="space-y-4">
      <Input
        name="shop"
        label="Your Shopify store domain"
        placeholder="dekorify.myshopify.com"
        value={shop}
        onChange={(event) => setShop(event.target.value)}
        disabled={disabled}
        hint="Just the store part is fine — ‘dekorify’ becomes dekorify.myshopify.com."
        required
      />
      <Button type="submit" disabled={disabled || clean.length < 3}>
        <Plug className="h-4 w-4" aria-hidden />
        Connect to Shopify
      </Button>
    </form>
  );
}

export function ConnectedActions({ domain }: { domain: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [includeProducts, setIncludeProducts] = useState(true);
  const [confirming, setConfirming] = useState(false);

  function runSync() {
    startTransition(async () => {
      const result = await syncShopifyAction(includeProducts);
      toast({
        title: result.ok ? "Sync complete" : "Sync failed",
        description: result.message,
        variant: result.ok ? "success" : "error",
      });
      if (result.ok) router.refresh();
    });
  }

  async function disconnect() {
    const result = await disconnectShopifyAction();
    toast({ title: result.message, variant: result.ok ? "success" : "error" });
    if (result.ok) router.refresh();
  }

  return (
    <>
      <div className="space-y-4">
        <Checkbox
          label="Also sync products"
          hint="Brings in titles, SKUs, prices and — where Shopify has them — unit costs."
          checked={includeProducts}
          onChange={(event) => setIncludeProducts(event.target.checked)}
        />

        <div className="flex flex-wrap gap-2">
          <Button onClick={runSync} loading={pending}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Sync now
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(true)} disabled={pending}>
            <Unplug className="h-4 w-4" aria-hidden />
            Disconnect
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={disconnect}
        title="Disconnect Shopify?"
        message={`${domain} will no longer sync. Orders and products already imported stay exactly as they are.`}
        confirmLabel="Disconnect"
      />
    </>
  );
}
