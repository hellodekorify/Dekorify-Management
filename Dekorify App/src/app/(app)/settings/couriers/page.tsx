import type { Metadata } from "next";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import {
  credentialsConfigured,
  credentialsFromEnv,
  ensureLeopardsCourier,
} from "@/lib/leopards/courier";
import { CITY_MAPPING_PREFIX } from "@/lib/leopards/sync";
import { orderCities } from "@/lib/orders/queries";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CityMappingManager,
  CourierSettingsForm,
  StatusMappingManager,
  type MappingRow,
} from "./couriers-client";

export const metadata: Metadata = { title: "Couriers" };

export default async function CourierSettingsPage() {
  const { store } = await requireContext();

  // Creating on first view means the settings page is never empty.
  const courierId = await ensureLeopardsCourier(store.id);

  const [courier, cities, recentLogs] = await Promise.all([
    prisma.courier.findUniqueOrThrow({
      where: { id: courierId },
      include: { statusMappings: { orderBy: [{ sortOrder: "asc" }, { courierStatus: "asc" }] } },
    }),
    orderCities(store.id),
    prisma.syncLog.findMany({
      where: { storeId: store.id, kind: { in: ["LEOPARDS_TRACKING", "LEOPARDS_BOOKING"] } },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
  ]);

  const statusMappings: MappingRow[] = courier.statusMappings
    .filter((mapping) => !mapping.courierStatus.startsWith(CITY_MAPPING_PREFIX))
    .map((mapping) => ({
      id: mapping.id,
      courierStatus: mapping.courierStatus,
      internalStatus: mapping.internalStatus,
      isIssue: mapping.isIssue,
      isAttempt: mapping.isAttempt,
      isTerminal: mapping.isTerminal,
    }));

  const cityMappings = courier.statusMappings
    .filter((mapping) => mapping.courierStatus.startsWith(CITY_MAPPING_PREFIX))
    .map((mapping) => ({
      id: mapping.id,
      name: mapping.courierStatus.slice(CITY_MAPPING_PREFIX.length),
      cityId: mapping.internalStatus,
    }));

  const mappedCityNames = new Set(cityMappings.map((city) => city.name.toLowerCase()));
  const unmappedCities = cities.filter((city) => !mappedCityNames.has(city.toLowerCase()));

  const configured = credentialsConfigured(courier);
  const fromEnv = credentialsFromEnv();

  return (
    <>
      <Card>
        <CardHeader
          title="Leopards Courier"
          description="Book shipments and pull tracking straight from Leopards."
          action={
            configured ? (
              <Badge tone={courier.lastSyncError ? "warning" : "positive"} dot>
                {courier.lastSyncError ? "Check connection" : "Configured"}
              </Badge>
            ) : (
              <Badge tone="neutral">Not configured</Badge>
            )
          }
        />
        <CourierSettingsForm
          courier={{
            hasKey: Boolean(courier.apiKey),
            apiEnvironment: courier.apiEnvironment,
            originCityId: courier.originCityId,
            returnAddress: courier.returnAddress,
          }}
          usingEnvCredentials={fromEnv}
        />
      </Card>

      {courier.lastSyncError && (
        <div className="flex items-start gap-3 rounded-xl border border-negative-border bg-negative-soft p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" aria-hidden />
          <div>
            <p className="text-[13.5px] font-semibold text-negative">Last attempt failed</p>
            <p className="mt-1 text-[13px] leading-relaxed text-negative">{courier.lastSyncError}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          title="Destination cities"
          description="Leopards books against numeric city IDs, so each city you ship to needs one."
        />
        <CityMappingManager cities={cityMappings} unmapped={unmappedCities} />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Status mapping"
          description="Leopards' wording on the left, what we record on the right. Their original text is always kept on the timeline."
        />
        <StatusMappingManager mappings={statusMappings} />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Recent courier activity"
          description="Every booking and tracking sync, with the raw response kept for debugging."
        />
        {recentLogs.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-muted">
              Nothing yet. Run a tracking sync from the Orders page once you have a shipment.
            </p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {recentLogs.map((log) => (
              <li key={log.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                {log.status === "SUCCESS" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-hidden />
                ) : log.status === "RUNNING" ? (
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">
                    {log.message ?? log.kind}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    {log.kind === "LEOPARDS_BOOKING" ? "Booking" : "Tracking sync"} ·{" "}
                    {log.trigger.toLowerCase()} · {formatDate(log.startedAt)}
                    {log.durationMs !== null ? ` · ${(log.durationMs / 1000).toFixed(1)}s` : ""}
                  </p>
                  {log.detail && log.status !== "SUCCESS" && (
                    <pre className="mt-1.5 max-h-24 overflow-auto rounded bg-surface-muted p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted">
                      {log.detail.slice(0, 400)}
                    </pre>
                  )}
                </div>
                <span className="shrink-0 text-[11.5px] text-muted">
                  {log.itemsChecked} checked · {log.itemsCreated} new
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
