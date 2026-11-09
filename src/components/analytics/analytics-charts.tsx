import { useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  LineChart,
  Line,
  Legend,
  CartesianGrid,
  Brush,
} from "recharts";
import { formatNumber } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  compositionChartsForGroup,
  labelForField,
  type CompositionChartDef,
} from "@/config/indicators";

const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

const TREND_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "#0ea5e9",
  "#a855f7",
  "#f97316",
  "#14b8a6",
];

/** Individual crime types only — exclude total_cases / recovery totals. */
const TREND_FIELD_IDS = [
  "murder",
  "robbery",
  "dacoity",
  "theft",
  "burglary",
  "woman_child_repression",
  "kidnapping",
  "police_assault",
  "riot",
  "speedy_trial",
] as const;

const tooltipStyle = {
  background: "var(--color-elevated)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "var(--color-fg)",
};

function valueFor(
  composition: Array<{ id: string; label: string; value: number }> | null | undefined,
  kpis: Array<{ id: string; value: number | null }> | null | undefined,
  fieldId: string,
): number {
  const fromComp = (composition ?? []).find((s) => s.id === fieldId);
  if (fromComp) return fromComp.value;
  const fromKpi = (kpis ?? []).find((k) => k.id === fieldId);
  return fromKpi?.value ?? 0;
}

function CompositionPieCard({
  def,
  slices,
}: {
  def: CompositionChartDef;
  slices: Array<{ id: string; label: string; value: number }>;
}) {
  const pieData = slices.filter((s) => s.value > 0);
  return (
    <article className="chart-card">
      <header>
        <h3>{def.title}</h3>
        {def.description ? <p>{def.description}</p> : null}
      </header>
      {pieData.length ? (
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={148}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="label" innerRadius={36} outerRadius={60} paddingAngle={2}>
                {pieData.map((entry, index) => (
                  <Cell key={entry.id} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatNumber(Number(value))}
                contentStyle={tooltipStyle}
                itemStyle={{ color: "var(--color-fg)" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <ul className="swatch-list">
            {pieData.map((slice, index) => (
              <li key={slice.id}>
                <span className="swatch" style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }} />
                <span>{slice.label}</span>
                <strong className="tabular-nums">{formatNumber(slice.value)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="empty-note">No numeric values for this chart.</p>
      )}
    </article>
  );
}

function CompareBarCard({
  def,
  values,
}: {
  def: CompositionChartDef;
  values: Array<{ id: string; label: string; value: number }>;
}) {
  const data = values.filter((v) => v.value > 0);
  return (
    <article className="chart-card">
      <header>
        <h3>{def.title}</h3>
        {def.description ? <p>{def.description}</p> : null}
      </header>
      {data.length ? (
        <div className="chart-body bar-body">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={88} tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
              <Tooltip
                formatter={(value) => formatNumber(Number(value))}
                contentStyle={tooltipStyle}
                itemStyle={{ color: "var(--color-fg)" }}
              />
              <Bar dataKey="value" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="empty-note">No numeric values for this comparison.</p>
      )}
    </article>
  );
}

/** Crime trend line chart with period range slider (Brush). */
function CrimeTrendCard({
  title,
  description,
  series,
}: {
  title: string;
  description: string;
  series: Array<{ period: string; values: Record<string, number> }>;
}) {
  // Order crime series by descending total across all periods (legend + lines)
  const orderedIds = useMemo(() => {
    const totals: Array<{ id: (typeof TREND_FIELD_IDS)[number]; total: number }> = TREND_FIELD_IDS.map(
      (id) => ({
        id,
        total: series.reduce((sum, pt) => sum + Number(pt.values[id] ?? 0), 0),
      }),
    );
    totals.sort((a, b) => b.total - a.total);
    return totals.map((t) => t.id);
  }, [series]);

  const data = useMemo(
    () =>
      series.map((pt) => {
        const row: Record<string, string | number> = { period: pt.period };
        for (const id of TREND_FIELD_IDS) {
          row[id] = Number(pt.values[id] ?? 0);
        }
        return row;
      }),
    [series],
  );
  const hasData = data.some((row) => TREND_FIELD_IDS.some((id) => Number(row[id]) > 0));
  const n = data.length;
  const [brush, setBrush] = useState<{ startIndex?: number; endIndex?: number }>({});

  const start = brush.startIndex ?? 0;
  const end = brush.endIndex ?? Math.max(0, n - 1);
  const windowed = n > 0 ? data.slice(start, end + 1) : data;

  return (
    <article className="chart-card chart-card-wide">
      <header>
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      {hasData ? (
        <div className="chart-body trend-body">
          {/* Legend — inline styles so it never depends on external CSS */}
          <ul
            aria-label="Crime series"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px 14px",
              listStyle: "none",
              margin: "0 0 8px",
              padding: "0 2px 8px",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            {orderedIds.map((id) => {
              const colorIdx = TREND_FIELD_IDS.indexOf(id);
              return (
              <li
                key={id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  lineHeight: 1.2,
                  color: "var(--color-fg, #151515)",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: TREND_COLORS[(colorIdx >= 0 ? colorIdx : 0) % TREND_COLORS.length],
                  }}
                />
                <span>{labelForField(id)}</span>
              </li>
            );})}
          </ul>

          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={windowed} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="period"
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                width={48}
                tickFormatter={(v) => formatNumber(Number(v))}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatNumber(Number(value)),
                  labelForField(String(name)),
                ]}
                contentStyle={tooltipStyle}
                itemStyle={{ color: "var(--color-fg)" }}
              />
              {orderedIds.map((id) => {
                const colorIdx = TREND_FIELD_IDS.indexOf(id);
                return (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  stroke={TREND_COLORS[(colorIdx >= 0 ? colorIdx : 0) % TREND_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                />
              );})}
            </LineChart>
          </ResponsiveContainer>

          {/* Period range slider below the chart */}
          {n > 2 ? (
            <div className="trend-brush-wrap">
              <ResponsiveContainer width="100%" height={44}>
                <LineChart data={data} margin={{ top: 4, right: 12, left: 48, bottom: 0 }}>
                  <XAxis dataKey="period" hide />
                  <YAxis hide domain={["auto", "auto"]} />
                  {TREND_FIELD_IDS.slice(0, 1).map((id) => (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      stroke="var(--color-border)"
                      strokeWidth={1}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                  <Brush
                    dataKey="period"
                    height={28}
                    stroke="var(--color-accent, #0079c1)"
                    fill="color-mix(in oklab, var(--color-accent, #0079c1) 14%, #ffffff)"
                    travellerWidth={12}
                    startIndex={start}
                    endIndex={end}
                    onChange={(range) => {
                      if (!range) return;
                      setBrush({
                        startIndex: range.startIndex,
                        endIndex: range.endIndex,
                      });
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "2px 4px 0",
                  fontSize: 10,
                  color: "var(--color-muted, #6a6a6a)",
                }}
              >
                <span>{data[start]?.period ?? ""}</span>
                <span>{data[end]?.period ?? ""}</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="empty-note">No trend values for the current filters.</p>
      )}
    </article>
  );
}

export function AnalyticsCharts() {
  const composition = useAppStore((s) => s.composition);
  const kpis = useAppStore((s) => s.kpis);
  const ranking = useAppStore((s) => s.ranking);
  const group = useAppStore((s) => s.analyticsGroup);
  const rankingColumns = useAppStore((s) => s.rankingColumns);
  const analyticsMetric = useAppStore((s) => s.analyticsMetric);
  const crimeTrends = useAppStore((s) => s.crimeTrends);
  const crimeFilters = useAppStore((s) => s.crimeFilters);

  const chartDefs = compositionChartsForGroup(group);
  const pieDefs = chartDefs.filter((d) => d.type !== "compare");
  const compareDefs = chartDefs.filter((d) => d.type === "compare");
  const isCrimes = group === "Crimes";

  const primaryMetricId = rankingColumns[0] || analyticsMetric;
  const primaryMetricLabel = primaryMetricId ? labelForField(primaryMetricId) : "";

  const barData = (ranking ?? []).slice(0, 8).map((row) => ({
    name: row.name.length > 12 ? `${row.name.slice(0, 12)}…` : row.name,
    full: row.name,
    value: row.value,
  }));

  const slicesFor = (def: CompositionChartDef) =>
    (def.fieldIds ?? []).map((id) => ({
      id,
      label: labelForField(id),
      value: valueFor(composition, kpis, id),
    }));

  const filterHint = [
    crimeFilters.unit ? `Unit: ${crimeFilters.unit}` : null,
    crimeFilters.year ? `Year: ${crimeFilters.year}` : null,
    crimeFilters.month ? `Month: ${crimeFilters.month}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="chart-grid">
      {isCrimes ? (
        <div className="chart-row chart-row-trends">
          <CrimeTrendCard
            title="Yearly trend — top crimes"
            description={
              filterHint
                ? `Totals by year (${filterHint}).`
                : "Totals by year across all periods."
            }
            series={crimeTrends?.yearly ?? []}
          />
          <CrimeTrendCard
            title="Monthly trend — top crimes"
            description={
              crimeFilters.year
                ? `Months in ${crimeFilters.year}.`
                : "Months aggregated across all years. Select a Year filter to scope one year."
            }
            series={crimeTrends?.monthly ?? []}
          />
        </div>
      ) : null}

      {(pieDefs.length > 0 || !chartDefs.length) && (
        <div className="chart-row chart-row-pies">
          {pieDefs.map((def) => (
            <CompositionPieCard key={def.id} def={def} slices={slicesFor(def)} />
          ))}
          {!chartDefs.length ? (
            <article className="chart-card">
              <header>
                <h3>{group} composition</h3>
                <p>No charts configured for this group</p>
              </header>
            </article>
          ) : null}
        </div>
      )}

      {compareDefs.length ? (
        <div className="chart-row chart-row-compare">
          {compareDefs.map((def) => (
            <CompareBarCard key={def.id} def={def} values={slicesFor(def)} />
          ))}
        </div>
      ) : null}

      <article className="chart-card chart-card-wide">
        <header>
          <h3>
            {primaryMetricLabel
              ? `Top areas — ${primaryMetricLabel}`
              : "Top areas"}
          </h3>
          <p>
            {isCrimes
              ? "Ranking respects Division, Unit, Year, and Month filters above."
              : "From the current ranking table"}
          </p>
        </header>
        {barData.length ? (
          <div className="chart-body bar-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 12 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value) => formatNumber(Number(value))}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as { full?: string } | undefined;
                    return row?.full ?? "";
                  }}
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "var(--color-fg)" }}
                />
                <Bar dataKey="value" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="empty-note">No ranking rows for the current filters.</p>
        )}
      </article>
    </div>
  );
}
