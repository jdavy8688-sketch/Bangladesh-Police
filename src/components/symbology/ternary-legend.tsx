import { blendTernary, rgbCss } from "@/config/symbology-schemes";

export function TernaryLegend({
  a,
  b,
  c,
  scheme,
}: {
  a: string;
  b: string;
  c: string;
  scheme: string;
}) {
  // Compact panel-friendly size (was 168 — too large for side panel)
  const size = 112;
  const pad = 8;
  const top = { x: size / 2, y: pad };
  const left = { x: pad, y: size - pad };
  const right = { x: size - pad, y: size - pad };
  const cells: Array<{ points: string; fill: string }> = [];
  const res = 7;

  for (let i = 0; i <= res; i += 1) {
    for (let j = 0; j <= res - i; j += 1) {
      const k = res - i - j;
      const aa = i / res;
      const bb = j / res;
      const cc = k / res;
      const p = barycentric(aa, bb, cc, left, right, top);
      const p2 = barycentric(i / res, (j + 1) / res, (k - 1) / res, left, right, top);
      const p3 = barycentric((i + 1) / res, j / res, (k - 1) / res, left, right, top);
      if (k === 0) continue;
      const fill = rgbCss(blendTernary(aa, bb, cc, scheme));
      cells.push({
        points: `${p.x},${p.y} ${clampPoint(p2, size).x},${clampPoint(p2, size).y} ${clampPoint(p3, size).x},${clampPoint(p3, size).y}`,
        fill,
      });
    }
  }

  return (
    <div className="ternary-legend">
      <p className="legend-kicker">Ternary / triangle</p>
      <div className="ternary-wrap">
        <span className="ternary-label ternary-label-top" title={c}>
          {shortLabel(c)}
        </span>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="ternary-svg"
          role="img"
          aria-label={`Ternary composition: ${a}, ${b}, ${c}`}
        >
          {cells.map((cell, index) => (
            <polygon
              key={index}
              points={cell.points}
              fill={cell.fill}
              stroke={cell.fill}
              strokeWidth="0.5"
            />
          ))}
          <polygon
            points={`${top.x},${top.y} ${right.x},${right.y} ${left.x},${left.y}`}
            fill="none"
            stroke="var(--color-border-strong)"
            strokeWidth="1"
          />
        </svg>
        <div className="ternary-base">
          <span className="ternary-label ternary-label-left" title={a}>
            {shortLabel(a)}
          </span>
          <span className="ternary-label ternary-label-right" title={b}>
            {shortLabel(b)}
          </span>
        </div>
      </div>
    </div>
  );
}

function barycentric(
  a: number,
  b: number,
  c: number,
  left: { x: number; y: number },
  right: { x: number; y: number },
  top: { x: number; y: number },
) {
  return {
    x: a * left.x + b * right.x + c * top.x,
    y: a * left.y + b * right.y + c * top.y,
  };
}

function clampPoint(p: { x: number; y: number }, size: number) {
  return {
    x: Math.max(0, Math.min(size, p.x)),
    y: Math.max(0, Math.min(size, p.y)),
  };
}

/** Short display label for tight panel space. */
function shortLabel(value: string) {
  const v = value.trim();
  if (v.length <= 12) return v;
  return `${v.slice(0, 11)}…`;
}
