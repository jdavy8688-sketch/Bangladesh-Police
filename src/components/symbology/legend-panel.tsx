import { rgbCss } from "@/config/symbology-schemes";
import { formatNumber } from "@/lib/utils";
import { BivariateLegend } from "@/components/symbology/bivariate-legend";
import { TernaryLegend } from "@/components/symbology/ternary-legend";
import { useAppStore } from "@/store/app-store";
import type { AppliedLegend } from "@/lib/symbology/renderers";

export function LegendPanel() {
  const applied = useAppStore((s) => s.applied);
  const entries = [
    applied.boundary ? { group: "Boundary", legend: applied.boundary } : null,
    applied.chart ? { group: "Chart", legend: applied.chart } : null,
  ].filter(Boolean) as Array<{ group: string; legend: AppliedLegend }>;

  if (!entries.length) {
    return (
      <div className="legend-empty">
        <p>
          No smart symbology applied yet. Open <strong>Symbology</strong>, choose indicators, then click{" "}
          <strong>Apply to map</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="legend-stack">
      {entries.map(({ group, legend }) => (
        <LegendBlock key={`${group}-${legend.method}`} group={group} legend={legend} />
      ))}
    </div>
  );
}

function LegendBlock({ group, legend }: { group: string; legend: AppliedLegend }) {
  return (
    <section className="legend-block">
      <div className="section-head">
        <h2>{group} legend</h2>
        <span className="method-tag">{legend.method}</span>
      </div>
      {legend.bivariate ? (
        <BivariateLegend
          xLabel={legend.bivariate.xLabel}
          yLabel={legend.bivariate.yLabel}
          palette={legend.bivariate.palette}
          breaksX={legend.bivariate.breaksX}
          breaksY={legend.bivariate.breaksY}
          totalsX={legend.bivariate.totalsX}
          totalsY={legend.bivariate.totalsY}
        />
      ) : legend.ternary ? (
        <TernaryLegend
          a={legend.ternary.a}
          b={legend.ternary.b}
          c={legend.ternary.c}
          scheme={legend.ternary.scheme}
        />
      ) : (
        <ul className="class-list">
          {legend.classes.map((item) => (
            <li key={item.label}>
              <span className="swatch" style={{ background: rgbCss(item.color) }} />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
      {legend.size ? <SizeLegend size={legend.size} /> : null}
    </section>
  );
}

/** Graduated circle classes (max / mid / low) next to values. */
function SizeLegend({
  size,
}: {
  size: {
    title: string;
    min: number;
    max: number;
    counts?: { high: number; mid: number; low: number };
  };
}) {
  const { min, max, title, counts } = size;
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) && max > lo ? max : lo + 1;
  const mid = (lo + hi) / 2;
  const lowBreak = lo + (hi - lo) * 0.12;

  const withCount = (label: string, count: number | undefined) =>
    count != null ? `${label} (${count})` : label;

  const classes = [
    { px: 28, label: withCount(formatNumber(Math.round(hi)), counts?.high) },
    { px: 18, label: withCount(formatNumber(Math.round(mid)), counts?.mid) },
    { px: 10, label: withCount(`< ${formatNumber(Math.round(lowBreak || 1))}`, counts?.low) },
  ];

  return (
    <div
      className="size-legend"
      style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: "1px solid rgba(0,0,0,0.1)",
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          color: "#6a6a6a",
          fontWeight: 600,
        }}
      >
        Size by {title}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {classes.map((c) => (
          <li
            key={c.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
              fontSize: 12,
              color: "#555",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 32,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: c.px,
                  height: c.px,
                  borderRadius: "50%",
                  border: "1.5px solid #333",
                  background: "rgba(0,0,0,0.04)",
                  boxSizing: "border-box",
                  display: "block",
                }}
                aria-hidden
              />
            </span>
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
