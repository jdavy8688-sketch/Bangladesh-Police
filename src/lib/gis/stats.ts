export function safeNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function numericValues(rows: Array<Record<string, unknown>>, field: string): number[] {
  const values: number[] = [];
  for (const row of rows) {
    const n = safeNumber(row[field]);
    if (n != null) values.push(n);
  }
  values.sort((a, b) => a - b);
  return values;
}

export function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  if (values.length === 1) return values[0]!;
  const clamped = Math.max(0, Math.min(1, q));
  const position = (values.length - 1) * clamped;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower]!;
  const fraction = position - lower;
  return values[lower]! * (1 - fraction) + values[upper]! * fraction;
}

export function quantileBreaks(values: number[], classCount: number): number[] {
  const breaks: number[] = [];
  for (let i = 1; i < classCount; i += 1) {
    const v = percentile(values, i / classCount);
    if (v != null) breaks.push(v);
  }
  return breaks;
}

export function minMax(values: number[]): { min: number; max: number } | null {
  if (!values.length) return null;
  return { min: values[0]!, max: values[values.length - 1]! };
}

export function quantizeTernary(shares: number[], resolution: number): [number, number, number] {
  const raw = shares.map((share) => Math.max(0, Math.min(1, share)) * resolution);
  const base = raw.map((value) => Math.floor(value));
  let remainder = resolution - base.reduce((s, v) => s + v, 0);
  const fractions = raw
    .map((value, index) => ({ frac: value - base[index]!, index }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < remainder; i += 1) {
    base[fractions[i]!.index] += 1;
  }
  return [base[0]!, base[1]!, base[2]!];
}
