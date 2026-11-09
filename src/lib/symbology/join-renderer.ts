/**
 * Convert client-side joined classifications into renderers that work on
 * geometry layers (indicator fields live on hosted tables, not on polygons).
 *
 * classBreaks / valueExpression need real attributes on the feature layer.
 * We map each feature's admin name → class symbol as uniqueValue (field1).
 */

import type { EsriRenderer } from "@/lib/symbology/renderers";

type Row = Record<string, unknown>;

function attrGet(row: Row, field: string): unknown {
  if (field in row) return row[field];
  const lower = field.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return row[k];
  }
  return undefined;
}

function defaultGraySymbol() {
  return {
    type: "esriSFS",
    style: "esriSFSSolid",
    color: [190, 190, 190, 220],
    outline: {
      type: "esriSLS",
      style: "esriSLSSolid",
      color: [90, 90, 90, 150],
      width: 0.6,
    },
  };
}

/** ArcGIS REST uniqueValue renderer keyed by admin name. */
function uniqueValueRenderer(
  keyField: string,
  uniqueValueInfos: Array<Record<string, unknown>>,
  defaultSymbol: unknown,
  legendOptions?: unknown,
): EsriRenderer {
  return {
    type: "uniqueValue",
    // REST / fromJSON expects field1 (not field)
    field1: keyField,
    field: keyField,
    uniqueValueInfos,
    defaultSymbol: defaultSymbol ?? defaultGraySymbol(),
    defaultLabel: "No data",
    legendOptions,
  };
}

/**
 * True when any value field is missing from the layer schema
 * (must materialize joined table values onto uniqueValue by admin name).
 *
 * Previously used `.every()` which skipped materialization for mixed
 * Crime + admin selections — classBreaks then referenced Crime fields that
 * do not exist on the geometry layer → all features default gray.
 */
export function fieldsMissingOnLayer(
  layerFields: Array<{ name: string }>,
  valueFields: string[],
): boolean {
  if (!valueFields.length) return false;
  const names = new Set(layerFields.map((f) => f.name.toLowerCase()));
  return valueFields.some((f) => !names.has(f.toLowerCase()));
}

/**
 * Always preferred for boundary symbology when values come from hosted tables.
 * Materialize a boundary renderer so it colors features by admin name.
 */
export function materializeJoinedBoundaryRenderer(args: {
  renderer: EsriRenderer;
  rows: Row[];
  /** Admin name field present on the geometry layer (adm1_en / adm2_en / …). */
  keyField: string;
  /** Numeric / classified fields from the hosted table. */
  valueFields: string[];
}): EsriRenderer {
  const { renderer, rows, keyField, valueFields } = args;
  const type = String(renderer.type || "");

  if (type === "classBreaks") {
    return materializeClassBreaks(renderer, rows, keyField);
  }

  if (type === "uniqueValue") {
    return materializeUniqueValue(renderer, rows, keyField, valueFields);
  }

  if (type === "simple") {
    return renderer;
  }

  return renderer;
}

function materializeClassBreaks(
  renderer: EsriRenderer,
  rows: Row[],
  keyField: string,
): EsriRenderer {
  const field = String(renderer.field ?? "");
  const infos =
    (renderer.classBreakInfos as Array<{
      classMinValue?: number;
      classMaxValue?: number;
      symbol?: unknown;
      label?: string;
    }>) ?? [];
  const classCount = infos.length;
  const uniqueValueInfos: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const key = String(attrGet(row, keyField) ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const raw = attrGet(row, field);
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;

    let symbol: unknown = renderer.defaultSymbol ?? defaultGraySymbol();
    for (let i = 0; i < classCount; i++) {
      const info = infos[i]!;
      const minV = Number(info.classMinValue);
      const maxV = Number(info.classMaxValue);
      let match = false;
      if (classCount === 1) {
        match = true;
      } else if (i === 0) {
        match = v <= maxV;
      } else if (i === classCount - 1) {
        match = v > minV;
      } else {
        match = v > minV && v <= maxV;
      }
      if (match) {
        symbol = info.symbol ?? symbol;
        break;
      }
    }

    uniqueValueInfos.push({
      value: key,
      symbol,
      label: key,
    });
  }

  return uniqueValueRenderer(
    keyField,
    uniqueValueInfos,
    renderer.defaultSymbol ?? defaultGraySymbol(),
    renderer.legendOptions,
  );
}

function materializeUniqueValue(
  renderer: EsriRenderer,
  rows: Row[],
  keyField: string,
  valueFields: string[],
): EsriRenderer {
  const infos =
    (renderer.uniqueValueInfos as Array<{
      value?: string;
      symbol?: unknown;
      label?: string;
    }>) ?? [];
  if (!infos.length) return renderer;

  const symbolByCode = new Map<string, unknown>();
  for (const info of infos) {
    if (info.value != null) symbolByCode.set(String(info.value), info.symbol);
  }

  // Already field-based uniqueValue without expression — rewrite field → field1
  if (renderer.field && !renderer.valueExpression) {
    return uniqueValueRenderer(
      String(renderer.field),
      infos as Array<Record<string, unknown>>,
      renderer.defaultSymbol ?? defaultGraySymbol(),
      renderer.legendOptions,
    );
  }

  if (valueFields.length === 2) {
    const [fx, fy] = valueFields;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const row of rows) {
      const xv = Number(attrGet(row, fx!));
      const yv = Number(attrGet(row, fy!));
      if (Number.isFinite(xv)) xs.push(xv);
      if (Number.isFinite(yv)) ys.push(yv);
    }
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const [x1, x2] = tertileBreaks(xs);
    const [y1, y2] = tertileBreaks(ys);

    const uniqueValueInfos: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const key = String(attrGet(row, keyField) ?? "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const x = Number(attrGet(row, fx!));
      const y = Number(attrGet(row, fy!));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const xc = x <= x1 ? 1 : x <= x2 ? 2 : 3;
      const yc = y <= y1 ? 1 : y <= y2 ? 2 : 3;
      const code = `${xc}_${yc}`;
      const symbol = symbolByCode.get(code) ?? renderer.defaultSymbol ?? defaultGraySymbol();
      uniqueValueInfos.push({ value: key, symbol, label: key });
    }
    return uniqueValueRenderer(
      keyField,
      uniqueValueInfos,
      renderer.defaultSymbol ?? defaultGraySymbol(),
      renderer.legendOptions,
    );
  }

  // Ternary: uniqueValueInfos are composition codes like A05_B03_C02
  const isTernary = infos.some((info) =>
    /^A\d{1,2}_B\d{1,2}_C\d{1,2}$/i.test(String(info.value ?? "")),
  );

  if (isTernary && valueFields.length >= 3) {
    const resolution = 10;
    const [fa, fb, fc] = valueFields;
    const uniqueValueInfos: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const key = String(attrGet(row, keyField) ?? "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const va = Number(attrGet(row, fa!));
      const vb = Number(attrGet(row, fb!));
      const vc = Number(attrGet(row, fc!));
      if (!Number.isFinite(va) || !Number.isFinite(vb) || !Number.isFinite(vc)) continue;
      const a = Math.max(0, va);
      const b = Math.max(0, vb);
      const c = Math.max(0, vc);
      const total = a + b + c;
      if (total <= 0) continue;
      const shares = [a / total, b / total, c / total];
      const [qa, qb, qc] = quantizeTernary(shares, resolution);
      const code = `A${String(qa).padStart(2, "0")}_B${String(qb).padStart(2, "0")}_C${String(qc).padStart(2, "0")}`;
      const symbol =
        symbolByCode.get(code) ?? renderer.defaultSymbol ?? defaultGraySymbol();
      uniqueValueInfos.push({ value: key, symbol, label: key });
    }
    return uniqueValueRenderer(
      keyField,
      uniqueValueInfos,
      renderer.defaultSymbol ?? defaultGraySymbol(),
      renderer.legendOptions,
    );
  }

  // Predominance (4+ fields, or 3 fields without ternary codes)
  if (valueFields.length >= 3) {
    const uniqueValueInfos: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const key = String(attrGet(row, keyField) ?? "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let bestField = valueFields[0]!;
      let bestVal = -Infinity;
      for (const f of valueFields) {
        const n = Number(attrGet(row, f));
        if (Number.isFinite(n) && n > bestVal) {
          bestVal = n;
          bestField = f;
        }
      }
      const symbol =
        symbolByCode.get(bestField) ??
        symbolByCode.get(String(bestField)) ??
        renderer.defaultSymbol ??
        defaultGraySymbol();
      uniqueValueInfos.push({ value: key, symbol, label: key });
    }
    return uniqueValueRenderer(
      keyField,
      uniqueValueInfos,
      renderer.defaultSymbol ?? defaultGraySymbol(),
      renderer.legendOptions,
    );
  }

  return renderer;
}

/** Same algorithm as @/lib/gis/stats quantizeTernary (kept local to avoid cycle). */
function quantizeTernary(shares: number[], resolution: number): [number, number, number] {
  const raw = shares.map((share) => Math.max(0, Math.min(1, share)) * resolution);
  const base = raw.map((value) => Math.floor(value));
  let remainder = resolution - base.reduce((s, v) => s + v, 0);
  const fractions = raw
    .map((value, index) => ({ frac: value - base[index]!, index }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < remainder; i += 1) {
    base[fractions[i]!.index]! += 1;
  }
  return [base[0]!, base[1]!, base[2]!];
}

function tertileBreaks(values: number[]): [number, number] {
  if (!values.length) return [0, 0];
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length === 1) return [unique[0]!, unique[0]!];
  if (unique.length === 2) return [unique[0]!, unique[0]!];
  const i1 = Math.max(0, Math.min(unique.length - 2, Math.floor(unique.length / 3)));
  let i2 = Math.max(i1 + 1, Math.min(unique.length - 1, Math.floor((2 * unique.length) / 3)));
  if (i2 <= i1) i2 = Math.min(unique.length - 1, i1 + 1);
  return [unique[i1]!, unique[i2]!];
}
