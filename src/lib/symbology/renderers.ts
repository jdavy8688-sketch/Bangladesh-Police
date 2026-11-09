/**
 * Client-side renderer JSON builders.
 *
 * Output is Esri REST renderer JSON so it can be applied with
 * `jsonUtils.fromJSON` — no published geoprocessing tool required.
 */

import {
  BIVARIATE_SCHEMES,
  CHART_PALETTES,
  CHOROPLETH_RAMPS,
  QUALITATIVE_BRIGHT,
  QUALITATIVE_MUTED,
  SINGLE_SYMBOL_COLORS,
  bivariatePalette,
  blendTernary,
  resolveScheme,
  type RGB,
} from "@/config/symbology-schemes";
import { minMax, numericValues, quantizeTernary, quantileBreaks, safeNumber } from "@/lib/gis/stats";
import { arcadeField, arcadeNumber, chartTotalExpression, sizeFieldExpression } from "@/lib/symbology/arcade";

export type EsriRenderer = Record<string, unknown>;

export type LegendClass = {
  label: string;
  color: RGB;
  value?: string;
  /** Sum of indicator field values in this class (when known). */
  count?: number;
};

export type AppliedLegend = {
  method: string;
  scheme: string;
  title: string;
  fields: Array<{ id: string; name: string; label: string }>;
  colors: Record<string, RGB>;
  classes: LegendClass[];
  size?: {
    min: number;
    max: number;
    title: string;
    /** Counts for high / mid / low size legend rows. */
    counts?: { high: number; mid: number; low: number };
  };
  ternary?: { a: string; b: string; c: string; scheme: string };
  bivariate?: {
    xLabel: string;
    yLabel: string;
    palette: Record<string, RGB>;
    breaksX?: number[];
    breaksY?: number[];
    /** Sum of field values in Low / Medium / High for each axis. */
    totalsX?: { low: number; mid: number; high: number };
    totalsY?: { low: number; mid: number; high: number };
  };
};

export type BuildResult = {
  renderer: EsriRenderer;
  legend: AppliedLegend;
};

type Row = Record<string, unknown>;

function polygonSymbol(rgb: RGB, alpha = 220) {
  return {
    type: "esriSFS",
    style: "esriSFSSolid",
    color: [rgb[0], rgb[1], rgb[2], alpha],
    outline: {
      type: "esriSLS",
      style: "esriSLSSolid",
      color: [90, 90, 90, 150],
      width: 0.6,
    },
  };
}

function defaultSymbol() {
  return polygonSymbol([190, 190, 190]);
}

function methodForBoundary(fieldCount: number): string {
  if (fieldCount <= 1) return "Quantile choropleth";
  if (fieldCount === 2) return "Bivariate Colors (3 x 3)";
  if (fieldCount === 3) return "Ternary / Triangular Composition";
  return "Predominant Variable";
}

export function describeMethod(layerGroup: "boundary" | "chart", fieldCount: number): string {
  if (layerGroup === "chart") return "Pie Chart + Data-Driven Size";
  return methodForBoundary(fieldCount);
}

function colorsFromScheme(requestedScheme: string, count: number): RGB[] {
  const palette = CHART_PALETTES[requestedScheme] ?? CHART_PALETTES.Auto;
  if (count <= 0) return [];
  if (count === 1) return [palette[0] ?? SINGLE_SYMBOL_COLORS[requestedScheme] ?? SINGLE_SYMBOL_COLORS.Auto];
  if (palette.length === 1) return Array.from({ length: count }, () => palette[0]!);
  const out: RGB[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i === count - 1) {
      out.push(palette[palette.length - 1]!);
    } else {
      const idx = Math.min(i, palette.length - 2);
      out.push(palette[idx]!);
    }
  }
  return out;
}

export function buildChartRenderer(args: {
  rows: Row[];
  fields: string[];
  aliases: Record<string, string>;
  requestedScheme: string;
  sizeField?: string | null;
  sizeLabel?: string | null;
}): BuildResult {
  const { rows, fields, aliases, requestedScheme, sizeField, sizeLabel } = args;
  const palette = CHART_PALETTES[requestedScheme] ?? CHART_PALETTES.Auto;
  const attributes = fields.map((field, index) => {
    const n = fields.length;
    let rgb = palette[0]!;
    if (palette.length && n > 1) {
      rgb = index === n - 1 ? palette[palette.length - 1]! : palette[Math.min(index, palette.length - 2)]!;
    }
    return {
      field,
      label: aliases[field] ?? field,
      color: [rgb[0], rgb[1], rgb[2], 255],
    };
  });

  const sizeValues: number[] = [];
  for (const row of rows) {
    if (sizeField) {
      const n = safeNumber(row[sizeField]);
      sizeValues.push(n != null ? Math.max(0, n) : 0);
    } else {
      let total = 0;
      for (const field of fields) {
        const n = safeNumber(row[field]);
        if (n != null) total += Math.max(0, n);
      }
      sizeValues.push(total);
    }
  }
  const valid = sizeValues.filter((v) => v != null);
  const extent = valid.length ? { min: Math.min(...valid), max: Math.max(...valid) } : { min: 0, max: 1 };
  let minDataValue = extent.min;
  let maxDataValue = extent.max;
  if (maxDataValue <= 0) {
    minDataValue = 0;
    maxDataValue = 1;
  } else if (minDataValue === maxDataValue) {
    minDataValue = 0;
  }

  const sizeLowBreak = minDataValue + (maxDataValue - minDataValue) * 0.12;
  const sizeMid = (minDataValue + maxDataValue) / 2;
  const sizeCounts = {
    high: valid.filter((v) => v >= sizeMid).length,
    mid: valid.filter((v) => v >= sizeLowBreak && v < sizeMid).length,
    low: valid.filter((v) => v < sizeLowBreak).length,
  };

  const valueExpression = sizeField ? sizeFieldExpression(sizeField) : chartTotalExpression(fields);
  const sizeTitle = sizeField ? (sizeLabel || sizeField) : "Total selected indicators";

  const renderer: EsriRenderer = {
    type: "pieChart",
    attributes,
    size: 24,
    holePercentage: 0,
    outline: {
      type: "esriSLS",
      style: "esriSLSSolid",
      color: [65, 65, 65, 220],
      width: 0.6,
    },
    defaultColor: [0, 0, 0, 0],
    defaultLabel: "No data",
    legendOptions: { title: "Selected indicators" },
    visualVariables: [
      {
        type: "sizeInfo",
        valueExpression,
        valueExpressionTitle: sizeTitle,
        minDataValue,
        maxDataValue,
        minSize: 12,
        maxSize: 48,
      },
    ],
    backgroundFillSymbol: {
      type: "esriSFS",
      style: "esriSFSSolid",
      color: [0, 0, 0, 0],
      outline: {
        type: "esriSLS",
        style: "esriSLSNull",
        color: [0, 0, 0, 0],
        width: 0,
      },
    },
  };

  return {
    renderer,
    legend: {
      method: "Pie Chart + Data-Driven Size",
      scheme: requestedScheme,
      title: "Selected indicators",
      fields: fields.map((name) => ({ id: name, name, label: aliases[name] ?? name })),
      colors: Object.fromEntries(
        attributes.map((a) => [a.field, [a.color[0], a.color[1], a.color[2]] as RGB]),
      ),
      classes: attributes.map((a) => ({
        label: a.label,
        color: [a.color[0], a.color[1], a.color[2]] as RGB,
        value: a.field,
      })),
      size: { min: minDataValue, max: maxDataValue, title: sizeTitle, counts: sizeCounts },
    },
  };
}

export function buildBoundaryRenderer(args: {
  rows: Row[];
  fields: string[];
  aliases: Record<string, string>;
  requestedScheme: string;
}): BuildResult {
  const { rows, fields, aliases, requestedScheme } = args;
  if (fields.length <= 1) return buildChoropleth({ rows, field: fields[0]!, aliases, requestedScheme });
  if (fields.length === 2) {
    return buildBivariate({
      rows,
      fieldX: fields[0]!,
      fieldY: fields[1]!,
      aliases,
      requestedScheme,
    });
  }
  if (fields.length === 3) return buildTernary({ rows, fields, aliases, requestedScheme });
  return buildPredominance({ rows, fields, aliases, requestedScheme });
}

function buildChoropleth(args: {
  rows: Row[];
  field: string;
  aliases: Record<string, string>;
  requestedScheme: string;
}): BuildResult {
  const { rows, field, aliases, requestedScheme } = args;
  const values = numericValues(rows, field);
  const ramp = CHOROPLETH_RAMPS[requestedScheme] ?? CHOROPLETH_RAMPS.Auto;
  const label = aliases[field] ?? field;

  if (values.length < 2 || values[0] === values[values.length - 1]) {
    const rgb = SINGLE_SYMBOL_COLORS[requestedScheme] ?? SINGLE_SYMBOL_COLORS.Auto;
    return {
      renderer: {
        type: "simple",
        label,
        symbol: polygonSymbol(rgb),
      },
      legend: {
        method: "Quantile choropleth",
        scheme: requestedScheme,
        title: label,
        fields: [{ id: field, name: field, label }],
        colors: { fill: rgb },
        classes: [{ label: withCount(formatBreak(values[0] ?? 0), sumValues(values)), color: rgb, count: sumValues(values) }],
      },
    };
  }

  const desired = Math.min(5, ramp.length);
  const edges = buildClassEdges(values, desired);
  const actualClasses = Math.max(1, edges.length - 1);
  const infos: Array<Record<string, unknown>> = [];
  const classes: LegendClass[] = [];

  for (let i = 0; i < actualClasses; i += 1) {
    const minV = edges[i]!;
    const maxV = edges[i + 1]!;
    const colorIndex =
      actualClasses <= 1
        ? 0
        : Math.round((i / (actualClasses - 1)) * (ramp.length - 1));
    const rgb = ramp[Math.min(colorIndex, ramp.length - 1)]!;
    const classLabel =
      actualClasses === 1
        ? `${formatBreak(minV)} – ${formatBreak(maxV)}`
        : i === 0
          ? `≤ ${formatBreak(maxV)}`
          : i === actualClasses - 1
            ? `> ${formatBreak(minV)}`
            : `${formatBreak(minV)} – ${formatBreak(maxV)}`;
    const count = sumClassMembers(values, i, actualClasses, edges);
    const labelWithCount = withCount(classLabel, count);
    infos.push({
      classMinValue: minV,
      classMaxValue: maxV,
      label: labelWithCount,
      symbol: polygonSymbol(rgb),
    });
    classes.push({ label: labelWithCount, color: rgb, count });
  }

  return {
    renderer: {
      type: "classBreaks",
      field,
      classificationMethod: "esriClassifyQuantile",
      minValue: values[0],
      classBreakInfos: infos,
      defaultSymbol: defaultSymbol(),
      defaultLabel: "No data",
      legendOptions: { title: label },
    },
    legend: {
      method: "Quantile choropleth",
      scheme: requestedScheme,
      title: label,
      fields: [{ id: field, name: field, label }],
      colors: Object.fromEntries(classes.map((c, i) => [`c${i}`, c.color])),
      classes,
    },
  };
}

/** Sum of field values in a class break, matching legend labels (≤ / range / >). */
function sumClassMembers(
  values: number[],
  classIndex: number,
  classCount: number,
  edges: number[],
): number {
  if (classCount <= 0 || values.length === 0) return 0;
  let members: number[];
  if (classCount === 1) {
    members = values;
  } else {
    const minV = edges[classIndex]!;
    const maxV = edges[classIndex + 1]!;
    if (classIndex === 0) {
      members = values.filter((v) => v <= maxV);
    } else if (classIndex === classCount - 1) {
      members = values.filter((v) => v > minV);
    } else {
      members = values.filter((v) => v > minV && v <= maxV);
    }
  }
  return sumValues(members);
}

function sumValues(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

function withCount(label: string, total: number): string {
  return `${label} (${formatBreak(total)})`;
}

function buildClassEdges(values: number[], desired: number): number[] {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length === 0) return [0, 1];
  if (unique.length === 1) return [unique[0]!, unique[0]!];

  const classCount = Math.min(Math.max(desired, 2), unique.length);

  const rawBreaks = quantileBreaks(values, classCount);
  let edges = [...new Set([values[0]!, ...rawBreaks, values[values.length - 1]!])].sort(
    (a, b) => a - b,
  );

  if (edges.length - 1 < classCount && unique.length >= 2) {
    edges = [];
    for (let i = 0; i <= classCount; i += 1) {
      const idx = Math.round((i / classCount) * (unique.length - 1));
      edges.push(unique[idx]!);
    }
    const strict: number[] = [edges[0]!];
    for (let i = 1; i < edges.length; i += 1) {
      if (edges[i]! > strict[strict.length - 1]!) strict.push(edges[i]!);
    }
    if (strict.length < 2) {
      return [unique[0]!, unique[unique.length - 1]!];
    }
    if (strict.length - 1 < classCount) {
      for (const v of unique) {
        if (strict.length - 1 >= classCount) break;
        if (!strict.includes(v)) {
          strict.push(v);
          strict.sort((a, b) => a - b);
        }
      }
    }
    edges = strict;
  }

  if (edges.length < 2) {
    return [unique[0]!, unique[unique.length - 1]!];
  }
  return edges;
}

/**
 * Two thresholds that split values into Low / Medium / High.
 * Uses unique-value spacing when classic quantiles would collapse to zeros.
 */
function tertileBreaks(values: number[]): [number, number] {
  if (!values.length) return [0, 0];
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length === 1) return [unique[0]!, unique[0]!];
  if (unique.length === 2) return [unique[0]!, unique[0]!];

  const q = quantileBreaks(values, 3);
  if (q.length >= 2 && q[0]! < q[1]!) {
    return [q[0]!, q[1]!];
  }

  const i1 = Math.max(0, Math.min(unique.length - 2, Math.floor(unique.length / 3)));
  let i2 = Math.max(i1 + 1, Math.min(unique.length - 1, Math.floor((2 * unique.length) / 3)));
  if (i2 <= i1) i2 = Math.min(unique.length - 1, i1 + 1);
  return [unique[i1]!, unique[i2]!];
}

/** Sum of values in Low (≤ t1) / Medium (t1 < v ≤ t2) / High (> t2). */
function tertileSums(values: number[], t1: number, t2: number): { low: number; mid: number; high: number } {
  let low = 0;
  let mid = 0;
  let high = 0;
  for (const v of values) {
    if (v <= t1) low += v;
    else if (v <= t2) mid += v;
    else high += v;
  }
  return { low, mid, high };
}

function formatBreak(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}K`;
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function buildBivariate(args: {
  rows: Row[];
  fieldX: string;
  fieldY: string;
  aliases: Record<string, string>;
  requestedScheme: string;
}): BuildResult {
  const { rows, fieldX, fieldY, aliases, requestedScheme } = args;
  const valuesX = numericValues(rows, fieldX);
  const valuesY = numericValues(rows, fieldY);
  if (!valuesX.length || !valuesY.length) {
    throw new Error("Both bivariate fields require numeric values.");
  }
  const [x1, x2] = tertileBreaks(valuesX);
  const [y1, y2] = tertileBreaks(valuesY);
  const schemeKey = resolveScheme(requestedScheme, "Bivariate Colors (3 x 3)");
  const palette = bivariatePalette(schemeKey);
  const labelX = aliases[fieldX] ?? fieldX;
  const labelY = aliases[fieldY] ?? fieldY;
  const levels: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High" };

  // Palette / legend keys are "x_y" (1-based), matching bivariatePalette() and BivariateLegend.
  const infos: Array<Record<string, unknown>> = [];
  const classes: LegendClass[] = [];
  for (let yClass = 1; yClass <= 3; yClass += 1) {
    for (let xClass = 1; xClass <= 3; xClass += 1) {
      const code = `${xClass}_${yClass}`;
      const rgb = palette[code] ?? ([200, 200, 200] as RGB);
      const label = `${labelX} ${levels[xClass]} / ${labelY} ${levels[yClass]}`;
      infos.push({ value: code, label, description: "", symbol: polygonSymbol(rgb) });
      classes.push({ label, color: rgb, value: code });
    }
  }

  const expression =
    `var x=${arcadeField(fieldX)}; var y=${arcadeField(fieldY)}; ` +
    `if(IsEmpty(x)||IsEmpty(y)){return '__NODATA__';} ` +
    `var xc=When(x<=${arcadeNumber(x1)},1,x<=${arcadeNumber(x2)},2,3); ` +
    `var yc=When(y<=${arcadeNumber(y1)},1,y<=${arcadeNumber(y2)},2,3); ` +
    `return Text(xc)+'_'+Text(yc);`;

  const minX = valuesX[0]!;
  const maxX = valuesX[valuesX.length - 1]!;
  const minY = valuesY[0]!;
  const maxY = valuesY[valuesY.length - 1]!;

  // Sum of indicator values in each tertile class (matches ≤ / range / > labels).
  const totalsX = tertileSums(valuesX, x1, x2);
  const totalsY = tertileSums(valuesY, y1, y2);

  return {
    renderer: {
      type: "uniqueValue",
      valueExpression: expression,
      valueExpressionTitle: `${labelX} × ${labelY}`,
      legendOptions: { title: `${labelX} × ${labelY}` },
      defaultLabel: "No data",
      defaultSymbol: defaultSymbol(),
      uniqueValueInfos: infos,
    },
    legend: {
      method: "Bivariate Colors (3 x 3)",
      scheme: schemeKey,
      title: `${labelX} × ${labelY}`,
      fields: [
        { id: fieldX, name: fieldX, label: labelX },
        { id: fieldY, name: fieldY, label: labelY },
      ],
      colors: Object.fromEntries(classes.map((c) => [c.value ?? c.label, c.color])),
      classes,
      bivariate: {
        xLabel: labelX,
        yLabel: labelY,
        palette: Object.fromEntries(
          [1, 2, 3].flatMap((x) => [1, 2, 3].map((y) => [`${x}_${y}`, palette[`${x}_${y}`]!])),
        ),
        // BivariateLegend expects [min, q33, q66, max] when present
        breaksX: [minX, x1, x2, maxX],
        breaksY: [minY, y1, y2, maxY],
        totalsX,
        totalsY,
      },
    },
  };
}

function buildTernary(args: {
  rows: Row[];
  fields: string[];
  aliases: Record<string, string>;
  requestedScheme: string;
}): BuildResult {
  const { rows, fields, aliases, requestedScheme } = args;
  const resolution = 10;
  const scheme = resolveScheme(requestedScheme, "Ternary / Triangular Composition");
  const observed = new Set<string>();

  for (const row of rows) {
    const values = fields.map((f) => safeNumber(row[f]));
    if (values.some((v) => v == null)) continue;
    const cleaned = values.map((v) => Math.max(0, v!));
    const total = cleaned.reduce((s, v) => s + v, 0);
    if (total <= 0) continue;
    const shares = cleaned.map((v) => v / total);
    const [qa, qb, qc] = quantizeTernary(shares, resolution);
    observed.add(`A${String(qa).padStart(2, "0")}_B${String(qb).padStart(2, "0")}_C${String(qc).padStart(2, "0")}`);
  }
  if (!observed.size) throw new Error("No valid ternary combinations were found.");

  const a = arcadeField(fields[0]!);
  const b = arcadeField(fields[1]!);
  const c = arcadeField(fields[2]!);
  const r = resolution;
  const expression =
    `var a=${a};var b=${b};var c=${c};` +
    `if(IsEmpty(a)||IsEmpty(b)||IsEmpty(c)){return '__NODATA__';}` +
    `a=Max(a,0);b=Max(b,0);c=Max(c,0);` +
    `var t=a+b+c;if(t<=0){return '__NODATA__';}` +
    `var ra=(a/t)*${r};var rb=(b/t)*${r};var rc=(c/t)*${r};` +
    `var qa=Floor(ra);var qb=Floor(rb);var qc=Floor(rc);` +
    `var fa=ra-qa;var fb=rb-qb;var fc=rc-qc;` +
    `var rem=${r}-(qa+qb+qc);` +
    `if(rem>=1){if(fa>=fb&&fa>=fc){qa+=1;fa=-1;}else if(fb>=fa&&fb>=fc){qb+=1;fb=-1;}else{qc+=1;fc=-1;}}` +
    `if(rem>=2){if(fa>=fb&&fa>=fc){qa+=1;}else if(fb>=fa&&fb>=fc){qb+=1;}else{qc+=1;}}` +
    `return 'A'+Text(qa,'00')+'_B'+Text(qb,'00')+'_C'+Text(qc,'00');`;

  const labels = fields.map((f) => aliases[f] ?? f);
  const infos: Array<Record<string, unknown>> = [];
  const classes: LegendClass[] = [];
  const pattern = /^A(\d+)_B(\d+)_C(\d+)$/;

  for (const code of [...observed].sort()) {
    const match = pattern.exec(code);
    if (!match) continue;
    const qa = Number(match[1]);
    const qb = Number(match[2]);
    const qc = Number(match[3]);
    const total = Math.max(1, qa + qb + qc);
    const shareA = qa / total;
    const shareB = qb / total;
    const shareC = qc / total;
    const rgb = blendTernary(shareA, shareB, shareC, scheme);
    const label = `${labels[0]} ${Math.round(shareA * 100)}% / ${labels[1]} ${Math.round(shareB * 100)}% / ${labels[2]} ${Math.round(shareC * 100)}%`;
    infos.push({ value: code, label, description: "", symbol: polygonSymbol(rgb) });
    classes.push({ label, color: rgb, value: code });
  }

  const title = `Ternary: ${labels.join(" / ")}`;
  return {
    renderer: {
      type: "uniqueValue",
      valueExpression: expression,
      valueExpressionTitle: title,
      legendOptions: { title },
      defaultLabel: "No data / Other",
      defaultSymbol: defaultSymbol(),
      uniqueValueInfos: infos,
    },
    legend: {
      method: "Ternary / Triangular Composition",
      scheme,
      title,
      fields: fields.map((name, i) => ({ id: name, name, label: labels[i]! })),
      colors: Object.fromEntries(classes.map((c) => [c.value ?? c.label, c.color])),
      classes,
      ternary: { a: labels[0]!, b: labels[1]!, c: labels[2]!, scheme },
    },
  };
}

function buildPredominance(args: {
  rows: Row[];
  fields: string[];
  aliases: Record<string, string>;
  requestedScheme: string;
}): BuildResult {
  const { rows, fields, aliases, requestedScheme } = args;
  const scheme = resolveScheme(requestedScheme, "Predominant Variable");
  const palette = scheme === "Qualitative - Muted" ? QUALITATIVE_MUTED : QUALITATIVE_BRIGHT;

  const declarations = fields
    .map((field, index) => {
      return (
        `var v${index}=${arcadeField(field)};` +
        `if(IsEmpty(v${index})){v${index}=0;}` +
        `v${index}=Max(v${index},0);`
      );
    })
    .join("");
  const totalExpression = fields.map((_, i) => `v${i}`).join("+");
  const tests = fields
    .map((field, index) => {
      const conditions = fields
        .map((_, other) => {
          if (other === index) return null;
          // Prefer earlier fields on ties (>= vs >).
          const operator = index < other ? ">=" : ">";
          return `v${index}${operator}v${other}`;
        })
        .filter(Boolean)
        .join("&&");
      return `if(${conditions || "true"}){return "${field.replaceAll('"', '\\"')}";}`;
    })
    .join("");
  const expression =
    `${declarations}var total=${totalExpression};if(total<=0){return '__NODATA__';}${tests}return '__NODATA__';`;

  const infos: Array<Record<string, unknown>> = [];
  const classes: LegendClass[] = [];
  // Always list every selected indicator in the legend (selection order), even if
  // it is not predominant in any feature of the current sample.
  fields.forEach((field, index) => {
    const rgb = palette[index % palette.length]!;
    const label = aliases[field] ?? field;
    infos.push({ value: field, label, description: "", symbol: polygonSymbol(rgb) });
    classes.push({ label, color: rgb, value: field });
  });

  return {
    renderer: {
      type: "uniqueValue",
      valueExpression: expression,
      valueExpressionTitle: "Predominant Variable",
      legendOptions: { title: "Predominant Variable" },
      defaultLabel: "No data / Other",
      defaultSymbol: defaultSymbol(),
      uniqueValueInfos: infos,
    },
    legend: {
      method: "Predominant Variable",
      scheme,
      title: "Predominant Variable",
      fields: fields.map((name) => ({ id: name, name, label: aliases[name] ?? name })),
      colors: Object.fromEntries(classes.map((c) => [c.value ?? c.label, c.color])),
      classes,
    },
  };
}
