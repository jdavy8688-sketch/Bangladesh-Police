import { rgbCss, type RGB } from "@/config/symbology-schemes";

function formatBreak(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}K`;
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

type AxisTotals = { low: number; mid: number; high: number };

/** breaks* = [min, q33, q66, max] when provided from the renderer. */
function rangeLabels(
  breaks?: number[],
  totals?: AxisTotals,
): { low: string; mid: string; high: string } {
  if (!breaks || breaks.length < 4) {
    return { low: "Low", mid: "Medium", high: "High" };
  }
  const b1 = breaks[1]!;
  const b2 = breaks[2]!;
  const withTotal = (label: string, total: number | undefined) =>
    total != null ? `${label} (${formatBreak(total)})` : label;
  return {
    low: withTotal(`≤ ${formatBreak(b1)}`, totals?.low),
    mid: withTotal(
      b1 === b2 ? `= ${formatBreak(b1)}` : `${formatBreak(b1)} – ${formatBreak(b2)}`,
      totals?.mid,
    ),
    high: withTotal(`> ${formatBreak(b2)}`, totals?.high),
  };
}

export function BivariateLegend({
  xLabel,
  yLabel,
  palette,
  breaksX,
  breaksY,
  totalsX,
  totalsY,
}: {
  xLabel: string;
  yLabel: string;
  palette: Record<string, RGB>;
  breaksX?: number[];
  breaksY?: number[];
  totalsX?: AxisTotals;
  totalsY?: AxisTotals;
}) {
  const xRanges = rangeLabels(breaksX, totalsX);
  const yRanges = rangeLabels(breaksY, totalsY);
  const xNames = [xRanges.low, xRanges.mid, xRanges.high];
  const yNames = [yRanges.low, yRanges.mid, yRanges.high];

  return (
    <div className="bivar-legend">
      <p className="legend-kicker">Bivariate colors (3 × 3)</p>

      <div className="bivar-plot">
        <span className="bivar-ylab" title={yLabel}>
          {yLabel}
        </span>
        <div className="bivar-stack">
          <span className="bivar-end">High</span>
          <div
            className="bivar-grid"
            role="img"
            aria-label={`${xLabel} by ${yLabel} 3 by 3 color matrix`}
          >
            {[3, 2, 1].map((y) =>
              [1, 2, 3].map((x) => {
                const rgb = palette[`${x}_${y}`] ?? [200, 200, 200];
                return (
                  <span
                    key={`${x}_${y}`}
                    style={{ background: rgbCss(rgb) }}
                    title={`${xLabel}: ${xNames[x - 1]} · ${yLabel}: ${yNames[y - 1]}`}
                  />
                );
              }),
            )}
          </div>
          <span className="bivar-end">Low</span>
        </div>
      </div>

      <div className="bivar-x">
        <span>Low</span>
        <span className="bivar-xlab" title={xLabel}>
          {xLabel}
        </span>
        <span>High</span>
      </div>

      <table className="bivar-ranges">
        <thead>
          <tr>
            <th scope="col">Class</th>
            <th scope="col">{xLabel}</th>
            <th scope="col">{yLabel}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Low</td>
            <td>{xRanges.low}</td>
            <td>{yRanges.low}</td>
          </tr>
          <tr>
            <td>Medium</td>
            <td>{xRanges.mid}</td>
            <td>{yRanges.mid}</td>
          </tr>
          <tr>
            <td>High</td>
            <td>{xRanges.high}</td>
            <td>{yRanges.high}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
