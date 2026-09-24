import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { amountFilter, makeLinkBuilders, parseListParams } from "@/lib/list-params";
import { formatMoney, formatPercent } from "@/lib/currency";
import { formatDate, toInputDate } from "@/lib/dates";
import { fxRateToNumber, toDecimalString } from "@/lib/money";
import {
  breakdownAdSpendByCampaign,
  breakdownAdSpendByPlatform,
  buildTimeSeries,
  loadDataset,
  summarise,
} from "@/lib/finance";
import { AD_PLATFORMS, adPlatformColor, adPlatformLabel } from "@/lib/constants";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import {
  AmountFilter,
  ClearFiltersButton,
  FilterBar,
  FilterSelect,
  SearchInput,
} from "@/components/filters/table-filters";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SummaryTile } from "@/components/ui/summary-tile";
import { Pagination } from "@/components/ui/pagination";
import { TableEmpty, TableWrap, TD, TFootRow, TH, THead } from "@/components/ui/table";
import { DonutChart, HorizontalBarChart, TrendChart } from "@/components/charts/chart-kit";
import { AddAdSpendButton, AdRow, type AdRowData } from "./ads-client";

export const metadata: Metadata = { title: "Ads Spend" };

const SORT_COLUMNS: Record<string, string> = {
  date: "date",
  platform: "platform",
  campaign: "campaignName",
  amount: "baseAmountMinor",
};

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { store } = await requireContext();
  const raw = await searchParams;
  const params = parseListParams(raw, { defaultSort: "date", defaultDir: "desc" });
  const links = makeLinkBuilders("/ads", raw);

  const where: Prisma.AdSpendWhereInput = {
    storeId: store.id,
    deletedAt: null,
    date: { gte: params.range.from, lte: params.range.to },
    ...(params.search
      ? {
          OR: [
            { campaignName: { contains: params.search } },
            { campaignId: { contains: params.search } },
            { notes: { contains: params.search } },
          ],
        }
      : {}),
    ...(raw.platform ? { platform: raw.platform } : {}),
    ...(amountFilter(params) ? { baseAmountMinor: amountFilter(params) } : {}),
  };

  const orderBy = {
    [SORT_COLUMNS[params.sort] ?? "date"]: params.dir,
  } as Prisma.AdSpendOrderByWithRelationInput;

  const [rows, total, aggregate, dataset] = await Promise.all([
    prisma.adSpend.findMany({
      where,
      orderBy: [orderBy, { createdAt: "desc" }],
      skip: params.skip,
      take: params.pageSize,
    }),
    prisma.adSpend.count({ where }),
    prisma.adSpend.aggregate({
      where,
      _sum: { baseAmountMinor: true, clicks: true, conversions: true, impressions: true },
    }),
    loadDataset(store.id, params.range),
  ]);

  const summary = summarise(dataset);
  const { points } = buildTimeSeries(dataset);

  const byPlatform = breakdownAdSpendByPlatform(dataset).map((row) => ({
    ...row,
    label: adPlatformLabel(row.key),
    color: adPlatformColor(row.key),
  }));
  const byCampaign = breakdownAdSpendByCampaign(dataset).slice(0, 10);

  const currency = store.baseCurrency;
  const periodTotal = aggregate._sum.baseAmountMinor ?? 0n;
  const clicks = aggregate._sum.clicks ?? 0;
  const conversions = aggregate._sum.conversions ?? 0;
  const pageTotal = rows.reduce((sum, row) => sum + row.baseAmountMinor, 0n);

  const entries: AdRowData[] = rows.map((row) => ({
    id: row.id,
    date: formatDate(row.date),
    dateInput: toInputDate(row.date),
    platform: row.platform,
    platformLabel: adPlatformLabel(row.platform),
    platformColor: adPlatformColor(row.platform),
    campaignName: row.campaignName,
    campaignId: row.campaignId,
    amountInput: toDecimalString(row.amountMinor),
    amountFormatted: formatMoney(row.amountMinor, row.currency, { decimals: true }),
    currency: row.currency,
    fxRateInput: String(fxRateToNumber(row.fxRateE8)),
    isForeign: row.currency !== currency,
    baseAmountFormatted: formatMoney(row.baseAmountMinor, currency),
    impressions: row.impressions,
    clicks: row.clicks,
    conversions: row.conversions,
    notes: row.notes,
  }));

  const costPerClick = clicks > 0 ? periodTotal / BigInt(clicks) : null;
  const costPerConversion = conversions > 0 ? periodTotal / BigInt(conversions) : null;

  return (
    <>
      <PageHeader
        title="Advertising spend"
        description="What you pay to acquire customers, and what it returns. Track it here to keep ROAS and TACOS honest."
        actions={<AddAdSpendButton baseCurrency={currency} />}
        filters={
          <FilterBar>
            <SearchInput placeholder="Search campaign name or ID…" />
            <FilterSelect
              param="platform"
              label="Platform"
              allLabel="All platforms"
              options={AD_PLATFORMS.map((platform) => ({
                value: platform.value,
                label: platform.label,
              }))}
            />
            <AmountFilter />
            <DateRangeFilter label={params.range.label} />
            <ClearFiltersButton />
          </FilterBar>
        }
      />

      <PageBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            label={`Total ad spend · ${params.range.label.toLowerCase()}`}
            value={formatMoney(periodTotal, currency)}
            sub={`${total.toLocaleString()} entr${total === 1 ? "y" : "ies"}`}
          />
          <SummaryTile
            label="ROAS"
            value={summary.roas === null ? "—" : `${summary.roas.toFixed(2)}×`}
            tone={summary.roas !== null && summary.roas >= 3 ? "positive" : undefined}
            sub={`${formatMoney(summary.netRevenue, currency)} revenue on ${formatMoney(summary.adSpend, currency)} spend`}
          />
          <SummaryTile
            label="TACOS"
            value={formatPercent(summary.tacosPct)}
            sub="Ad spend as a share of net revenue"
          />
          <SummaryTile
            label="Cost per conversion"
            value={costPerConversion === null ? "—" : formatMoney(costPerConversion, currency)}
            sub={
              costPerClick === null
                ? "Add clicks and conversions to see this"
                : `${formatMoney(costPerClick, currency, { decimals: true })} per click`
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              title="Revenue against ad spend"
              description="If the gap narrows, acquisition is getting more expensive"
            />
            <CardBody>
              <TrendChart
                data={points}
                currency={currency}
                series={[
                  { dataKey: "revenue", name: "Net revenue", color: "#4f46e5", type: "area" },
                  { dataKey: "adSpend", name: "Ad spend", color: "#ec4899", type: "area" },
                ]}
                height={280}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Spend by platform" />
            <CardBody>
              {byPlatform.length === 0 ? (
                <p className="py-14 text-center text-[13px] text-muted">
                  No ad spend in this period.
                </p>
              ) : (
                <>
                  <DonutChart data={byPlatform} currency={currency} height={200} />
                  <ul className="mt-4 space-y-2">
                    {byPlatform.map((row) => (
                      <li key={row.key} className="flex items-center gap-2.5 text-[13px]">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: row.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-muted-strong">
                          {row.label}
                        </span>
                        <span className="tabular shrink-0 font-medium">
                          {formatMoney(row.amount, currency)}
                        </span>
                        <span className="tabular w-11 shrink-0 text-right text-muted">
                          {formatPercent(row.sharePct, 0)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        {byCampaign.length > 0 && (
          <Card>
            <CardHeader title="Top campaigns" description="By spend in this period" />
            <CardBody>
              <HorizontalBarChart
                data={byCampaign.map((row) => ({
                  label: row.label.length > 28 ? `${row.label.slice(0, 27)}…` : row.label,
                  amountMajor: row.amountMajor,
                }))}
                currency={currency}
                height={Math.max(200, byCampaign.length * 32)}
                color="#ec4899"
              />
            </CardBody>
          </Card>
        )}

        <Card className="overflow-hidden">
          <TableWrap>
            <THead>
              <TH sortKey="date" currentSort={params.sort} currentDir={params.dir} sortHref={links.sortHref}>
                Date
              </TH>
              <TH
                sortKey="platform"
                currentSort={params.sort}
                currentDir={params.dir}
                sortHref={links.sortHref}
              >
                Platform
              </TH>
              <TH
                sortKey="campaign"
                currentSort={params.sort}
                currentDir={params.dir}
                sortHref={links.sortHref}
              >
                Campaign
              </TH>
              <TH align="right">Impressions</TH>
              <TH align="right">Clicks</TH>
              <TH align="right">Conv.</TH>
              <TH
                align="right"
                sortKey="amount"
                currentSort={params.sort}
                currentDir={params.dir}
                sortHref={links.sortHref}
              >
                Spend
              </TH>
              <TH width="52px" />
            </THead>

            <tbody>
              {entries.length === 0 ? (
                <TableEmpty
                  colSpan={8}
                  title="No ad spend matches these filters"
                  description="Record what you spend on Meta, Google and TikTok to see ROAS against your real revenue."
                  action={<AddAdSpendButton baseCurrency={currency} />}
                />
              ) : (
                entries.map((entry) => (
                  <AdRow key={entry.id} entry={entry} baseCurrency={currency} />
                ))
              )}
            </tbody>

            {entries.length > 0 && (
              <TFootRow>
                <TD colSpan={6} className="text-[13px] text-muted-strong">
                  Total on this page
                </TD>
                <TD numeric align="right">
                  {formatMoney(pageTotal, currency)}
                </TD>
                <TD />
              </TFootRow>
            )}
          </TableWrap>

          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={total}
            hrefFor={links.pageHref}
          />
        </Card>
      </PageBody>
    </>
  );
}
