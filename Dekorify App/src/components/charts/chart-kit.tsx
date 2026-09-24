"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Shared formatting
// ---------------------------------------------------------------------------

/** Charts receive plain numbers in major units; axes stay short and readable. */
export function formatAxisValue(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (magnitude >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (magnitude >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

function formatFull(value: number, currency: string): string {
  const negative = value < 0;
  const body = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Math.abs(value),
  );
  return negative ? `(${currency} ${body})` : `${currency} ${body}`;
}

const AXIS_STYLE = {
  fontSize: 11.5,
  fill: "var(--muted)",
} as const;

const GRID_STYLE = {
  stroke: "var(--border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

function ChartTooltip({
  active,
  payload,
  label,
  currency,
  valueSuffix,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
  currency: string;
  valueSuffix?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5"
      style={{ boxShadow: "var(--shadow-lg)" }}
    >
      <p className="mb-1.5 text-[12px] font-semibold text-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2.5 text-[12.5px]">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span className="text-muted">{entry.name}</span>
            <span className="tabular ml-auto pl-3 font-medium text-foreground">
              {valueSuffix
                ? `${new Intl.NumberFormat("en-US").format(entry.value ?? 0)}${valueSuffix}`
                : formatFull(entry.value ?? 0, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendContent({
  payload,
}: {
  payload?: { value?: string; color?: string }[];
}) {
  if (!payload?.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-3">
      {payload.map((entry, index) => (
        <span key={index} className="flex items-center gap-1.5 text-[12px] text-muted-strong">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
            aria-hidden
          />
          {entry.value}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend chart — revenue, profit, cash over time
// ---------------------------------------------------------------------------

export interface TrendSeries {
  dataKey: string;
  name: string;
  color: string;
  type?: "area" | "line";
}

export function TrendChart({
  data,
  series,
  currency,
  height = 280,
  showLegend = true,
}: {
  data: Record<string, string | number>[];
  series: TrendSeries[];
  currency: string;
  height?: number;
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          {series.map((item) => (
            <linearGradient
              key={item.dataKey}
              id={`gradient-${item.dataKey}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={item.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={item.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid {...GRID_STYLE} />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          minTickGap={16}
        />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxisValue}
          width={52}
        />
        <Tooltip
          content={<ChartTooltip currency={currency} />}
          cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
        />
        {showLegend && <Legend content={<LegendContent />} />}

        {series.map((item) =>
          item.type === "line" ? (
            <Line
              key={item.dataKey}
              type="monotone"
              dataKey={item.dataKey}
              name={item.name}
              stroke={item.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            />
          ) : (
            <Area
              key={item.dataKey}
              type="monotone"
              dataKey={item.dataKey}
              name={item.name}
              stroke={item.color}
              strokeWidth={2}
              fill={`url(#gradient-${item.dataKey})`}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            />
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Grouped bars — expenses, cost structure
// ---------------------------------------------------------------------------

export function GroupedBarChart({
  data,
  series,
  currency,
  height = 280,
  stacked = false,
  showLegend = true,
}: {
  data: Record<string, string | number>[];
  series: { dataKey: string; name: string; color: string }[];
  currency: string;
  height?: number;
  stacked?: boolean;
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          minTickGap={16}
        />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxisValue}
          width={52}
        />
        <Tooltip
          content={<ChartTooltip currency={currency} />}
          cursor={{ fill: "var(--surface-muted)" }}
        />
        {showLegend && <Legend content={<LegendContent />} />}
        {series.map((item) => (
          <Bar
            key={item.dataKey}
            dataKey={item.dataKey}
            name={item.name}
            fill={item.color}
            stackId={stacked ? "stack" : undefined}
            radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
            maxBarSize={44}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Profit bars — one series, coloured by sign so losses read instantly
// ---------------------------------------------------------------------------

export function ProfitBarChart({
  data,
  dataKey,
  name,
  currency,
  height = 260,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  name: string;
  currency: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          minTickGap={16}
        />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxisValue}
          width={52}
        />
        <Tooltip
          content={<ChartTooltip currency={currency} />}
          cursor={{ fill: "var(--surface-muted)" }}
        />
        <Bar dataKey={dataKey} name={name} radius={[4, 4, 0, 0]} maxBarSize={44}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={Number(entry[dataKey]) >= 0 ? "var(--positive)" : "var(--negative)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Donut — category and platform share
// ---------------------------------------------------------------------------

export function DonutChart({
  data,
  currency,
  height = 240,
}: {
  data: { label: string; amountMajor: number; color?: string | null }[];
  currency: string;
  height?: number;
}) {
  const slices = data.slice(0, 8);
  const remainder = data.slice(8);

  const chartData = [
    ...slices,
    ...(remainder.length > 0
      ? [
          {
            label: `Other (${remainder.length})`,
            amountMajor: remainder.reduce((sum, item) => sum + item.amountMajor, 0),
            color: "#cbd5e1",
          },
        ]
      : []),
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="amountMajor"
          nameKey="label"
          innerRadius="58%"
          outerRadius="86%"
          paddingAngle={2}
          strokeWidth={2}
          stroke="var(--surface)"
        >
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip currency={currency} />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bars — top products, top campaigns
// ---------------------------------------------------------------------------

export function HorizontalBarChart({
  data,
  currency,
  height = 280,
  color = "#4f46e5",
}: {
  data: { label: string; amountMajor: number; color?: string | null }[];
  currency: string;
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxisValue}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={130}
        />
        <Tooltip
          content={<ChartTooltip currency={currency} />}
          cursor={{ fill: "var(--surface-muted)" }}
        />
        <Bar dataKey="amountMajor" name="Amount" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color ?? color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Cash flow — in, out and the resulting net line
// ---------------------------------------------------------------------------

export function CashFlowChart({
  data,
  currency,
  height = 280,
}: {
  data: Record<string, string | number>[];
  currency: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          minTickGap={16}
        />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxisValue}
          width={52}
        />
        <Tooltip
          content={<ChartTooltip currency={currency} />}
          cursor={{ fill: "var(--surface-muted)" }}
        />
        <Legend content={<LegendContent />} />
        <Bar dataKey="cashIn" name="Cash in" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar
          dataKey="cashOut"
          name="Cash out"
          fill="#f43f5e"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Line
          type="monotone"
          dataKey="netCashFlow"
          name="Net movement"
          stroke="#101828"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function AreaSingleChart({
  data,
  dataKey,
  name,
  color,
  currency,
  height = 200,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  name: string;
  color: string;
  currency: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`solo-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.24} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          minTickGap={20}
        />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxisValue}
          width={48}
        />
        <Tooltip content={<ChartTooltip currency={currency} />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          fill={`url(#solo-${dataKey})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
