import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  credentialsFromEnv,
  LEOPARDS_CODE,
  resolveCredentials,
} from "@/lib/leopards/courier";
import { readTrackingSettings } from "@/lib/leopards/settings";
import { SYNC_KIND } from "@/lib/leopards/sync-tracking";
import { formatPkt, relativeTime } from "@/lib/leopards/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  CredentialsForm,
  SyncSettingsForm,
  TestConnectionButton,
} from "./tracking-settings-client";

export const metadata: Metadata = { title: "Tracking settings" };
export const dynamic = "force-dynamic";

export default async function TrackingSettingsPage() {
  const { store } = await requireContext();

  const courier = await prisma.courier.findUnique({
    where: { storeId_code: { storeId: store.id, code: LEOPARDS_CODE } },
  });

  const connected = courier ? resolveCredentials(courier) !== null : false;

  const [settings, logs, active, total, requestsToday] = await Promise.all([
    readTrackingSettings(store.id),
    prisma.syncLog.findMany({
      where: { storeId: store.id, kind: SYNC_KIND },
      orderBy: { startedAt: "desc" },
      take: 15,
    }),
    prisma.leopardsShipment.count({ where: { storeId: store.id, isTerminal: false } }),
    prisma.leopardsShipment.count({ where: { storeId: store.id } }),
    prisma.syncLog.count({
      where: {
        storeId: store.id,
        kind: SYNC_KIND,
        startedAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    }),
  ]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Leopards Courier connection"
          description="The only source of shipment data in this application. Credentials are read on the server and are never sent to the browser."
          action={
            <Badge tone={connected ? "positive" : "neutral"} dot>
              {connected ? "Configured" : "Not configured"}
            </Badge>
          }
        />
        <CardBody className="space-y-5">
          <CredentialsForm
            hasKey={Boolean(courier?.apiKey)}
            environment={courier?.apiEnvironment ?? "production"}
            originCityId={courier?.originCityId ?? ""}
            fromEnv={credentialsFromEnv()}
          />
          {connected && (
            <div className="border-t border-border-subtle pt-5">
              <TestConnectionButton />
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat label="Shipments tracked" value={String(total)} />
        <Stat label="Still moving" value={String(active)} sub="Polled on the interval below" />
        <Stat label="Sync runs, last 24h" value={String(requestsToday)} />
      </div>

      <Card>
        <CardHeader
          title="Synchronisation"
          description="How often this application asks Leopards for updates."
        />
        <CardBody>
          <SyncSettingsForm settings={settings} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Synchronisation log"
          description="Every attempt, successful or not."
          action={
            <Link href="/tracking" className="text-[13px] text-brand hover:underline">
              Open the dashboard
            </Link>
          }
        />
        <CardBody>
          {logs.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">
              Nothing has run yet.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {logs.map((log) => (
                <li key={log.id} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          log.status === "SUCCESS"
                            ? "positive"
                            : log.status === "FAILED"
                              ? "negative"
                              : "warning"
                        }
                      >
                        {log.status}
                      </Badge>
                      <span className="text-[12.5px] text-muted">{log.trigger.toLowerCase()}</span>
                    </div>
                    <p className="mt-1 text-[13px] text-foreground">{log.message}</p>
                    {log.detail && (
                      <p className="mt-0.5 truncate text-[12px] text-muted">{log.detail}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12.5px] text-foreground">{relativeTime(log.startedAt)}</p>
                    <p className="text-[11.5px] text-muted">{formatPkt(log.startedAt)}</p>
                    {log.durationMs !== null && (
                      <p className="text-[11.5px] text-subtle">{log.durationMs} ms</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-xl border border-border-subtle bg-surface px-4 py-3.5"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p className="tabular mt-1 text-[19px] font-semibold tracking-[-0.02em] text-foreground">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}
