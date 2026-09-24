"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { addShipmentsAction, refreshTrackingAction } from "@/app/actions/tracking";
import type { TrackingActionResult } from "@/app/actions/tracking";

/**
 * Refresh now.
 *
 * The result is reported as it came back — including a partial or failed sync —
 * because a button that always claims success teaches you to distrust it.
 */
export function RefreshButton({
  trackingNumber,
  label = "Refresh now",
}: {
  trackingNumber?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TrackingActionResult | null>(null);

  // Refreshing in a separate effect rather than inside the transition: called
  // immediately after the action, `router.refresh()` runs against the router
  // state from before the server revalidated, and the freshness banner keeps
  // showing the previous sync — the one thing on this page that must never be
  // out of date.
  useEffect(() => {
    if (!result) return;
    router.refresh();
    const timer = setTimeout(() => setResult(null), 8000);
    return () => clearTimeout(timer);
  }, [result, router]);

  return (
    <div className="flex items-center gap-2.5">
      {result && (
        <span
          className={`inline-flex items-center gap-1.5 text-[12.5px] ${
            result.ok ? "text-positive" : "text-negative"
          }`}
          role="status"
        >
          {result.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span className="max-w-[24rem] truncate">{result.detail ?? result.message}</span>
        </span>
      )}
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await refreshTrackingAction(trackingNumber));
          })
        }
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        {label}
      </Button>
    </div>
  );
}

/** Adding CNs by hand or by pasting a column from a portal export. */
export function AddShipmentsButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<TrackingActionResult | null, FormData>(
    addShipmentsAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      const timer = setTimeout(() => setOpen(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [state, router]);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Add tracking numbers
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add tracking numbers">
        <form action={action} className="space-y-4">
          <p className="text-[13px] leading-relaxed text-muted">
            Leopards can report everything about a parcel you name, but it has no
            endpoint that lists your shipments — so the CN numbers have to come from
            you. Paste one per line, or paste a column straight out of a
            booked-packets export.
          </p>

          <Field label="Tracking numbers" htmlFor="numbers">
            <Textarea
              id="numbers"
              name="numbers"
              rows={8}
              required
              placeholder={"LE7544278331\nLE7544278335"}
              className="font-mono text-[13px]"
            />
          </Field>

          {state && (
            <div
              role="alert"
              className={`flex items-start gap-2.5 rounded-lg border p-3 ${
                state.ok
                  ? "border-positive-border bg-positive-soft"
                  : "border-negative-border bg-negative-soft"
              }`}
            >
              {state.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-hidden />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden />
              )}
              <div className={`text-[13px] ${state.ok ? "text-positive" : "text-negative"}`}>
                <p>{state.message}</p>
                {state.detail && <p className="mt-1 opacity-80">{state.detail}</p>}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Add and fetch
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/**
 * Filters written into the URL, so a filtered view can be linked and survives
 * a refresh. Each control submits immediately; the search box waits for a
 * pause in typing.
 */
export function TrackingFilters({ locations }: { locations: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");

  const push = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    next.delete("page");
    router.push(`/tracking?${next.toString()}`);
  };

  useEffect(() => {
    const current = params.get("search") ?? "";
    if (search === current) return;
    const timer = setTimeout(() => push({ search: search || null }), 350);
    return () => clearTimeout(timer);
    // `push` is recreated each render; depending on it would fire every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const active =
    params.get("status") ||
    params.get("location") ||
    params.get("from") ||
    params.get("to") ||
    params.get("search");

  const selectClass =
    "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="CN, reference, consignee, city…"
        aria-label="Search shipments"
        className="h-9 w-64 rounded-lg border border-border-strong bg-surface px-3 text-[13px] text-foreground placeholder:text-muted"
      />

      <select
        value={params.get("location") ?? ""}
        onChange={(event) => push({ location: event.target.value || null })}
        aria-label="Filter by location"
        className={selectClass}
      >
        <option value="">All locations</option>
        {locations.map((location) => (
          <option key={location} value={location}>
            {location}
          </option>
        ))}
      </select>

      <input
        type="date"
        value={params.get("from") ?? ""}
        onChange={(event) => push({ from: event.target.value || null })}
        aria-label="Last update from"
        className={selectClass}
      />
      <input
        type="date"
        value={params.get("to") ?? ""}
        onChange={(event) => push({ to: event.target.value || null })}
        aria-label="Last update to"
        className={selectClass}
      />

      <select
        value={params.get("sort") ?? "recent"}
        onChange={(event) => push({ sort: event.target.value })}
        aria-label="Sort"
        className={selectClass}
      >
        <option value="recent">Newest update first</option>
        <option value="oldest">Oldest update first</option>
        <option value="cn">CN number</option>
        <option value="status">Status</option>
      </select>

      {active && (
        <Button variant="ghost" onClick={() => router.push("/tracking")}>
          <X className="h-4 w-4" aria-hidden />
          Clear
        </Button>
      )}
    </div>
  );
}
