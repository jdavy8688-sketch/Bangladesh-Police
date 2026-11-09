/**
 * Hosted table access + join helpers.
 *
 * Join rules (explicit):
 *   1) Crime_Data hosted table → join on Unit field ONLY.
 *   2) All other indicators → administrative name fields on the geometry layer:
 *        Division: adm1_en | District: adm2_en | Upazila: adm3_en | Union: adm4_en
 *   3) Mixed Crime + other indicators → Crime values still join on Unit only;
 *      other indicator values come from adm* attributes (no Crime join on adm*).
 *
 * Crime_Data is aggregated by Unit (and year/month / dateFilter when set).
 */

import {
  ADMIN_LEVELS,
  CRIME_TABLE,
  type AdminLevel,
  type AdminLevelId,
  type CrimeFilters,
} from "@/config/layers";
import { rowMatchesDateFilter } from "@/lib/gis/date-filter";
import { toFieldInfoFromEsri, type FieldInfo } from "@/lib/gis/fields";
import type { EsriFeature, EsriLayer } from "@/lib/gis/map-controller";

type TableCacheEntry = {
  rows: Array<Record<string, unknown>>;
  fields: FieldInfo[];
  loadedAt: number;
};

const tableCache = new Map<string, TableCacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function attrGet(attrs: Record<string, unknown>, field: string): unknown {
  if (field in attrs) return attrs[field];
  const lower = field.toLowerCase();
  for (const key of Object.keys(attrs)) {
    if (key.toLowerCase() === lower) return attrs[key];
  }
  return undefined;
}

function normalizeKeyPart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/** Align common BD spelling variants (Barishal/Barisal, Chattogram/Chittagong). */
function normalizePlaceName(value: unknown): string {
  let s = normalizeKeyPart(value);
  if (!s) return s;
  s = s.replace(/\s+/g, " ");
  // Official renames / alternate spellings used across layers vs tables
  const pairs: Array<[RegExp, string]> = [
    [/\bbarishal\b/g, "barisal"],
    [/\bchattogram\b/g, "chittagong"],
    [/\bbogura\b/g, "bogra"],
    [/\bjashore\b/g, "jessore"],
    [/\bcumilla\b/g, "comilla"],
  ];
  for (const [re, to] of pairs) s = s.replace(re, to);
  return s;
}

export function buildJoinKey(
  attrs: Record<string, unknown>,
  joinFields: string[],
): string {
  const parts: string[] = [];
  for (const field of joinFields) {
    const v = attrGet(attrs, field);
    if (v == null || String(v).trim() === "") continue;
    parts.push(`${field.toLowerCase()}=${normalizeKeyPart(v)}`);
  }
  return parts.join("|");
}

export function buildJoinKeyFallbacks(
  attrs: Record<string, unknown>,
  joinFields: string[],
): string[] {
  const keys: string[] = [];
  const primary = buildJoinKey(attrs, joinFields);
  if (primary) keys.push(primary);
  for (const field of joinFields) {
    const v = attrGet(attrs, field);
    if (v == null || String(v).trim() === "") continue;
    keys.push(`${field.toLowerCase()}=${normalizeKeyPart(v)}`);
  }
  return keys;
}

export type MapLike = {
  findLayer: (title: string) => EsriLayer | null;
  featureLayers: () => EsriLayer[];
  queryAttributes: (
    layer: EsriLayer,
    options?: {
      where?: string;
      outFields?: string[];
      orderByFields?: string[];
      num?: number;
      returnGeometry?: boolean;
      returnDistinctValues?: boolean;
      geometry?: unknown | null;
    },
  ) => Promise<EsriFeature[]>;
};

function normalizeTableTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\.csv$/i, "")
    .replace(/[\s_\-]+/g, "");
}

function matchTableLayer(map: MapLike, title: string): EsriLayer | null {
  const wanted = title.trim().toLowerCase();
  const wantedNorm = normalizeTableTitle(title);
  const exact = map.findLayer(title);
  if (exact) return exact;
  const alt = wanted.endsWith(".csv") ? wanted.slice(0, -4) : `${wanted}.csv`;
  const altHit = map.findLayer(alt);
  if (altHit) return altHit;
  for (const layer of map.featureLayers()) {
    const t = (layer.title || "").trim().toLowerCase();
    if (t === wanted || t === alt) return layer;
    if (t === `${wanted} table` || t === `table ${wanted}`) return layer;
    if (normalizeTableTitle(t) === wantedNorm) return layer;
  }
  return null;
}

export function findHostedTable(map: MapLike, title: string): EsriLayer | null {
  return matchTableLayer(map, title);
}

export function findAdminTable(map: MapLike, levelId: AdminLevelId): EsriLayer | null {
  const level = ADMIN_LEVELS.find((l) => l.id === levelId);
  if (!level) return null;
  return findHostedTable(map, level.tableTitle);
}

export function findCrimeTable(map: MapLike): EsriLayer | null {
  const titles = [
    CRIME_TABLE.title,
    ...((CRIME_TABLE as { titleAliases?: readonly string[] }).titleAliases ?? []),
  ];
  for (const t of titles) {
    const hit = findHostedTable(map, t);
    if (hit) return hit;
  }
  // Soft match any layer/table whose normalized title contains "crime"
  for (const layer of map.featureLayers()) {
    const n = normalizeTableTitle(layer.title || "");
    if (n.includes("crime") && (n.includes("data") || n === "crime")) return layer;
  }
  return null;
}

/**
 * Resolve a Crime unit name (e.g. DMP, Barishal Range) to custom_unit_code values.
 * Geometry layers use different Unit labels (Dhaka City Corporation) but share codes.
 */
export async function resolveCrimeUnitCodes(
  map: MapLike,
  unitName: string,
): Promise<string[]> {
  if (!unitName?.trim()) return [];
  const table = findCrimeTable(map);
  if (!table) return [];
  const { rows } = await loadTableRows(map, table);
  const want = unitName.trim().toLowerCase();
  const wantNorm = normalizePlaceName(unitName);
  const codes = new Set<string>();
  for (const row of rows) {
    const u = String(attrGet(row, "unit") ?? attrGet(row, "unit") ?? attrGet(row, "Unit") ?? "")
      .trim()
      .toLowerCase();
    if (u !== want && normalizePlaceName(u) !== wantNorm) continue;
    const code = String(
      attrGet(row, "custom_unit_code") ?? attrGet(row, "custom_unit_code") ?? attrGet(row, "Custom_Unit_Code") ?? "",
    ).trim();
    if (code) codes.add(code);
  }
  return [...codes];
}

export async function loadTableRows(
  map: MapLike,
  table: EsriLayer,
  force = false,
): Promise<TableCacheEntry> {
  const cacheKey = table.id || table.title || table.url || "table";
  const cached = tableCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached;
  }

  const features = await map.queryAttributes(table, {
    where: "1=1",
    outFields: ["*"],
    returnGeometry: false,
    num: 50_000,
  });
  const rows = features.map((f) => ({ ...(f.attributes ?? {}) }));
  const fields = toFieldInfoFromEsri(table.fields ?? []);
  const entry: TableCacheEntry = { rows, fields, loadedAt: Date.now() };
  tableCache.set(cacheKey, entry);
  return entry;
}

export function clearTableCache(): void {
  tableCache.clear();
}

export function indexTableRows(
  rows: Array<Record<string, unknown>>,
  joinFields: string[],
): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    for (const key of buildJoinKeyFallbacks(row, joinFields)) {
      if (!key) continue;
      if (!index.has(key)) index.set(key, row);
    }
  }
  return index;
}

export function mergeRow(
  layerAttrs: Record<string, unknown>,
  tableIndex: Map<string, Record<string, unknown>>,
  joinFields: string[],
): Record<string, unknown> {
  const merged = { ...layerAttrs };
  for (const key of buildJoinKeyFallbacks(layerAttrs, joinFields)) {
    const hit = tableIndex.get(key);
    if (hit) {
      return { ...merged, ...hit };
    }
  }
  return merged;
}

function rowMatchesCrimeFilters(
  row: Record<string, unknown>,
  filters?: Partial<CrimeFilters> | null,
  unitSet?: Set<string> | null,
): boolean {
  const unit = String(attrGet(row, "unit") ?? attrGet(row, "Unit") ?? "").trim();
  const code = String(attrGet(row, "custom_unit_code") ?? attrGet(row, "Custom_Unit_Code") ?? "").trim();
  if (filters?.unit) {
    const f = filters.unit.trim().toLowerCase();
    if (unit.toLowerCase() !== f && code.toLowerCase() !== f) return false;
  } else if (unitSet && unitSet.size) {
    if (!unitSet.has(unit.toLowerCase()) && !(code && unitSet.has(code.toLowerCase()))) {
      return false;
    }
  }
  const df = filters?.dateFilter;
  if (df && df.mode && df.mode !== "all") {
    if (
      !rowMatchesDateFilter(attrGet(row, "year"), attrGet(row, "month"), df, {
        years: [],
        months: [],
      })
    ) {
      return false;
    }
  } else {
    if (filters?.year) {
      const y = String(attrGet(row, "year") ?? "").trim();
      if (y !== String(filters.year).trim()) return false;
    }
    if (filters?.month) {
      const m = String(attrGet(row, "month") ?? "").trim();
      if (m.toLowerCase() !== String(filters.month).trim().toLowerCase()) return false;
    }
  }
  return true;
}

export async function queryJoinedAttributes(options: {
  map: MapLike;
  level: AdminLevel;
  layer: EsriLayer;
  where?: string;
  outFields?: string[];
  orderByFields?: string[];
  num?: number;
  geometry?: unknown | null;
  unitFilter?: string | null;
}): Promise<Array<Record<string, unknown>>> {
  const { map, level, layer, where, outFields, orderByFields, num, geometry, unitFilter } = options;
  const table = findAdminTable(map, level.id);

  const layerFeatures = await map.queryAttributes(layer, {
    where: where || layer.definitionExpression || "1=1",
    outFields: ["*"],
    returnGeometry: false,
    geometry,
    num: num ?? 50_000,
  });

  // Crime Unit names (DMP) ≠ geometry Unit labels (Dhaka City Corporation).
  // Resolve Crime unit → custom_unit_code, then filter geometry by code.
  const unitCodes = unitFilter
    ? await resolveCrimeUnitCodes(map, unitFilter).catch(() => [] as string[])
    : [];
  const unitCodeSet = new Set(unitCodes.map((c) => c.toLowerCase()));
  const matchesUnitFilter = (r: Record<string, unknown>): boolean => {
    if (!unitFilter) return true;
    const code = String(
      attrGet(r, "Custom_Unit_Code") ?? attrGet(r, "custom_unit_code") ?? "",
    )
      .trim()
      .toLowerCase();
    if (unitCodeSet.size && code && unitCodeSet.has(code)) return true;
    const u = normalizeKeyPart(attrGet(r, "Unit") ?? attrGet(r, "unit"));
    return u === unitFilter.trim().toLowerCase();
  };

  if (!table) {
    let rows = layerFeatures.map((f) => ({ ...(f.attributes ?? {}) }));
    if (unitFilter) rows = rows.filter(matchesUnitFilter);
    return rows;
  }

  const { rows: tableRows } = await loadTableRows(map, table);
  let sourceRows = tableRows;
  if (unitFilter) sourceRows = tableRows.filter(matchesUnitFilter);
  const index = indexTableRows(sourceRows, level.tableJoinFields);
  let merged = layerFeatures.map((f) =>
    mergeRow(f.attributes ?? {}, index, level.tableJoinFields),
  );
  if (unitFilter) merged = merged.filter(matchesUnitFilter);

  if (orderByFields?.length) {
    const spec = orderByFields[0]!;
    const desc = /\sDESC$/i.test(spec);
    const field = spec.replace(/\s+(ASC|DESC)$/i, "").trim();
    merged = [...merged].sort((a, b) => {
      const av = Number(attrGet(a, field));
      const bv = Number(attrGet(b, field));
      const an = Number.isFinite(av) ? av : 0;
      const bn = Number.isFinite(bv) ? bv : 0;
      return desc ? bn - an : an - bn;
    });
  }

  if (typeof num === "number" && num > 0) {
    merged = merged.slice(0, num);
  }

  if (outFields?.length && !outFields.includes("*")) {
    const wanted = new Set(outFields.map((f) => f.toLowerCase()));
    merged = merged.map((row) => {
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (wanted.has(k.toLowerCase())) next[k] = v;
      }
      return next;
    });
  }

  return merged;
}

export async function sumJoinedFields(options: {
  map: MapLike;
  level: AdminLevel;
  layer: EsriLayer;
  fieldNames: string[];
  where?: string;
  geometry?: unknown | null;
  unitFilter?: string | null;
}): Promise<Record<string, number>> {
  const rows = await queryJoinedAttributes({
    map: options.map,
    level: options.level,
    layer: options.layer,
    where: options.where,
    geometry: options.geometry,
    unitFilter: options.unitFilter,
  });
  const out: Record<string, number> = {};
  for (const name of options.fieldNames) {
    let total = 0;
    for (const row of rows) {
      const n = Number(attrGet(row, name));
      if (Number.isFinite(n)) total += n;
    }
    out[name] = total;
  }
  return out;
}

export async function schemaForLevel(
  map: MapLike,
  level: AdminLevel,
  layer: EsriLayer,
): Promise<FieldInfo[]> {
  const table = findAdminTable(map, level.id);
  const layerFields = toFieldInfoFromEsri(layer.fields ?? []);
  if (!table) return layerFields;
  const { fields: tableFields } = await loadTableRows(map, table);
  const byLower = new Map<string, FieldInfo>();
  for (const f of layerFields) byLower.set(f.name.toLowerCase(), f);
  for (const f of tableFields) {
    if (!byLower.has(f.name.toLowerCase())) byLower.set(f.name.toLowerCase(), f);
  }
  return Array.from(byLower.values());
}

export async function loadCrimeFilterOptions(map: MapLike): Promise<{
  units: string[];
  years: string[];
  months: string[];
}> {
  const table = findCrimeTable(map);
  if (!table) return { units: [], years: [], months: [] };
  const { rows } = await loadTableRows(map, table);
  const units = new Set<string>();
  const years = new Set<string>();
  const months = new Set<string>();
  for (const row of rows) {
    const u = String(attrGet(row, "unit") ?? attrGet(row, "Unit") ?? "").trim();
    const y = String(attrGet(row, "year") ?? "").trim();
    const m = String(attrGet(row, "month") ?? "").trim();
    if (u) units.add(u);
    if (y) years.add(y);
    if (m) months.add(m);
  }
  return {
    units: [...units].sort((a, b) => a.localeCompare(b)),
    years: [...years].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    months: [...months],
  };
}

/** Admin Unit names for Unit filter, restricted by Division when set. */
export async function loadCascadedUnitOptions(
  map: MapLike,
  division: string | null,
): Promise<string[]> {
  const table = findAdminTable(map, "division") ?? findAdminTable(map, "district");
  if (!table) {
    const crime = await loadCrimeFilterOptions(map);
    return crime.units;
  }
  const { rows } = await loadTableRows(map, table);
  const units = new Set<string>();
  const divWanted = division ? division.trim().toLowerCase() : null;
  for (const row of rows) {
    if (divWanted) {
      const d = String(attrGet(row, "adm1_en") ?? "").trim().toLowerCase();
      if (d !== divWanted) continue;
    }
    const u = String(attrGet(row, "unit") ?? attrGet(row, "Unit") ?? "").trim();
    if (u) units.add(u);
  }
  return [...units].sort((a, b) => a.localeCompare(b));
}

export async function queryCrimeAggregates(options: {
  map: MapLike;
  fieldNames: string[];
  units?: string[] | null;
  crimeFilters?: Partial<CrimeFilters> | null;
}): Promise<{
  totals: Record<string, number>;
  byUnit: Array<Record<string, unknown>>;
  fields: FieldInfo[];
}> {
  const table = findCrimeTable(options.map);
  if (!table) {
    return { totals: {}, byUnit: [], fields: [] };
  }
  const { rows, fields } = await loadTableRows(options.map, table);
  const unitSet =
    options.units?.length
      ? new Set(options.units.map((u) => u.trim().toLowerCase()).filter(Boolean))
      : null;

  const byUnitMap = new Map<string, Record<string, unknown>>();
  const totals: Record<string, number> = {};
  for (const name of options.fieldNames) totals[name] = 0;

  for (const row of rows) {
    if (!rowMatchesCrimeFilters(row, options.crimeFilters, unitSet)) continue;

    const unit = String(attrGet(row, "unit") ?? attrGet(row, "Unit") ?? "").trim();
    const code = String(attrGet(row, "custom_unit_code") ?? attrGet(row, "Custom_Unit_Code") ?? "").trim();
    const key = (code || unit).toLowerCase() || "_";
    let agg = byUnitMap.get(key);
    if (!agg) {
      agg = {
        Unit: unit,
        Custom_Unit_Code: code || attrGet(row, "Custom_Unit_Code"),
      };
      for (const name of options.fieldNames) agg[name] = 0;
      byUnitMap.set(key, agg);
    }
    for (const name of options.fieldNames) {
      const n = Number(attrGet(row, name));
      if (!Number.isFinite(n)) continue;
      agg[name] = Number(agg[name] ?? 0) + n;
      totals[name] = (totals[name] ?? 0) + n;
    }
  }

  return {
    totals,
    byUnit: Array.from(byUnitMap.values()),
    fields,
  };
}

/**
 * Join Crime_Data aggregates onto geometry features.
 * Matches primarily by Custom_Unit_Code, then by Unit name.
 * Crime field values are coerced to numbers for symbology.
 */
export async function queryJoinedCrimeAttributes(options: {
  map: MapLike;
  level: AdminLevel;
  layer: EsriLayer;
  fieldNames: string[];
  where?: string;
  geometry?: unknown | null;
  crimeFilters?: Partial<CrimeFilters> | null;
  units?: string[] | null;
  orderByFields?: string[];
  num?: number;
}): Promise<Array<Record<string, unknown>>> {
  const crime = await queryCrimeAggregates({
    map: options.map,
    fieldNames: options.fieldNames,
    units: options.units,
    crimeFilters: options.crimeFilters,
  });

  // Primary index: Custom_Unit_Code → aggregated crime row
  const byCode = new Map<string, Record<string, unknown>>();
  const byUnitName = new Map<string, Record<string, unknown>>();
  for (const row of crime.byUnit) {
    const code = String(row.Custom_Unit_Code ?? "").trim();
    const u = String(attrGet(row, "unit") ?? row.Unit ?? "").trim();
    if (code) byCode.set(code.toLowerCase(), row);
    if (u) {
      byUnitName.set(u.toLowerCase(), row);
      const uNorm = normalizePlaceName(u);
      if (uNorm) byUnitName.set(uNorm, row);
    }
  }

  /**
   * adminName (normalized) → Custom_Unit_Code / Unit lists for crime rollup.
   * Prefer geometry layer attributes (new web map); fall back to hosted admin table.
   */
  const codesByAdminName = new Map<string, string[]>();
  const unitsByAdminName = new Map<string, string[]>();
  const indexAdminRows = (adminRows: Array<Record<string, unknown>>) => {
    for (const row of adminRows) {
      const rawName = String(attrGet(row, options.level.nameField) ?? "").trim();
      const name = normalizePlaceName(rawName);
      if (!name) continue;
      const code = String(
        attrGet(row, "Custom_Unit_Code") ?? attrGet(row, "custom_unit_code") ?? "",
      ).trim();
      const unit = String(attrGet(row, "unit") ?? attrGet(row, "Unit") ?? "").trim();
      const nameKeys = Array.from(new Set([name, rawName.toLowerCase()].filter(Boolean)));
      for (const nk of nameKeys) {
        if (code) {
          const list = codesByAdminName.get(nk) ?? [];
          if (!list.includes(code)) list.push(code);
          codesByAdminName.set(nk, list);
        }
        if (unit) {
          const list = unitsByAdminName.get(nk) ?? [];
          if (!list.includes(unit)) list.push(unit);
          unitsByAdminName.set(nk, list);
        }
      }
    }
  };
  try {
    const boundary = options.map.findLayer(options.level.layerTitles.boundary);
    if (boundary) {
      const feats = await options.map.queryAttributes(boundary, {
        where: "1=1",
        outFields: ["*"],
        returnGeometry: false,
        num: 50_000,
      });
      indexAdminRows(feats.map((f) => ({ ...(f.attributes ?? {}) })));
    }
  } catch {
    /* boundary optional */
  }
  if (!codesByAdminName.size && !unitsByAdminName.size) {
    try {
      const adminTable = findAdminTable(options.map, options.level.id);
      if (adminTable) {
        const { rows: adminRows } = await loadTableRows(options.map, adminTable);
        indexAdminRows(adminRows);
      }
    } catch {
      /* admin table optional */
    }
  }

  const sumCrimeForCodes = (codes: string[]): Record<string, number> | null => {
    const sums: Record<string, number> = {};
    for (const name of options.fieldNames) sums[name] = 0;
    let any = false;
    for (const c of codes) {
      const row = byCode.get(String(c).trim().toLowerCase());
      if (!row) continue;
      any = true;
      for (const name of options.fieldNames) {
        const n = Number(attrGet(row, name));
        if (Number.isFinite(n)) sums[name] += n;
      }
    }
    return any ? sums : null;
  };

  const sumCrimeForUnits = (unitNames: string[]): Record<string, number> | null => {
    const sums: Record<string, number> = {};
    for (const name of options.fieldNames) sums[name] = 0;
    let any = false;
    for (const u of unitNames) {
      const nk = u.toLowerCase();
      const row = byUnitName.get(nk) || byUnitName.get(normalizePlaceName(u));
      if (!row) continue;
      any = true;
      for (const name of options.fieldNames) {
        const n = Number(attrGet(row, name));
        if (Number.isFinite(n)) sums[name] += n;
      }
    }
    return any ? sums : null;
  };

  // Chart layers are often empty placeholders — join against Boundary geometry instead.
  let layerFeatures = await options.map.queryAttributes(options.layer, {
    where: options.where || options.layer.definitionExpression || "1=1",
    outFields: ["*"],
    returnGeometry: false,
    geometry: options.geometry,
    num: 50_000,
  });
  if (!layerFeatures.length) {
    try {
      const boundary = options.map.findLayer(options.level.layerTitles.boundary);
      if (boundary) {
        layerFeatures = await options.map.queryAttributes(boundary, {
          where: "1=1",
          outFields: ["*"],
          returnGeometry: false,
          geometry: options.geometry,
          num: 50_000,
        });
      }
    } catch {
      /* boundary optional */
    }
  }

  // Crime_Data → geometry: match Unit first, then roll up by admin name via
  // Custom_Unit_Code / Unit lists (codesByAdminName / unitsByAdminName).
  let merged = layerFeatures.map((f) => {
    const attrs = { ...(f.attributes ?? {}) };
    const featUnit = String(attrGet(attrs, "unit") ?? attrGet(attrs, "Unit") ?? "").trim();
    const featCode = String(
      attrGet(attrs, "Custom_Unit_Code") ?? attrGet(attrs, "custom_unit_code") ?? "",
    ).trim();
    const adminNameRaw = String(attrGet(attrs, options.level.nameField) ?? "").trim();
    const adminNorm = normalizePlaceName(adminNameRaw);

    let sums: Record<string, number> | null = null;

    // 1) Direct unit / code match (Crime_Data is by Unit)
    if (featCode && byCode.has(featCode.toLowerCase())) {
      const row = byCode.get(featCode.toLowerCase())!;
      sums = {};
      for (const name of options.fieldNames) {
        const n = Number(attrGet(row, name));
        sums[name] = Number.isFinite(n) ? n : 0;
      }
    } else if (featUnit) {
      const row =
        byUnitName.get(featUnit.toLowerCase()) ||
        byUnitName.get(normalizePlaceName(featUnit)) ||
        null;
      if (row) {
        sums = {};
        for (const name of options.fieldNames) {
          const n = Number(attrGet(row, name));
          sums[name] = Number.isFinite(n) ? n : 0;
        }
      }
    }

    // 2) Admin-name rollup (Division/District/… charts): sum all units under this name
    if (!sums && adminNorm) {
      const codes = codesByAdminName.get(adminNorm) || codesByAdminName.get(adminNameRaw.toLowerCase());
      if (codes?.length) sums = sumCrimeForCodes(codes);
      if (!sums) {
        const units = unitsByAdminName.get(adminNorm) || unitsByAdminName.get(adminNameRaw.toLowerCase());
        if (units?.length) sums = sumCrimeForUnits(units);
      }
    }

    const next: Record<string, unknown> = { ...attrs };
    if (adminNameRaw) {
      next[options.level.nameField] = adminNameRaw;
    }
    if (featUnit) {
      next["unit"] = featUnit;
      next["Unit"] = featUnit;
    }
    if (featCode) {
      next["Custom_Unit_Code"] = featCode;
      next["custom_unit_code"] = featCode;
    }
    for (const name of options.fieldNames) {
      next[name] = sums && Number.isFinite(sums[name]!) ? sums[name]! : 0;
    }
    return next;
  });

  // If still no geometry rows (empty chart + empty boundary), emit pure crime-by-unit rows
  // so chart apply can still place pies when centroid cache has Unit keys.
  if (!merged.length && crime.byUnit.length) {
    merged = crime.byUnit.map((row) => {
      const next: Record<string, unknown> = { ...row };
      for (const name of options.fieldNames) {
        const n = Number(attrGet(row, name));
        next[name] = Number.isFinite(n) ? n : 0;
      }
      return next;
    });
  }

  // Always one row per admin name at this level (Division/District/…).
  // Sum crime across all Units under the same adm* name so Chart centroids
  // (keyed by adm1_en / adm2_en / …) match Boundary and Chart joins.
  // Unit-level detail is preserved on Unit/Custom_Unit_Code attributes when unique.
  {
    const byAdmin = new Map<string, Record<string, unknown>>();
    for (const row of merged) {
      const nameRaw = String(attrGet(row, options.level.nameField) ?? "").trim();
      const name = normalizePlaceName(nameRaw);
      const unit = normalizePlaceName(attrGet(row, "unit") ?? attrGet(row, "Unit"));
      const code = String(
        attrGet(row, "custom_unit_code") ?? attrGet(row, "Custom_Unit_Code") ?? "",
      )
        .trim()
        .toLowerCase();
      // Prefer admin name; fall back to unit/code so pure unit rows still emit
      const key = name || code || unit || `_oid_${byAdmin.size}`;
      const existing = byAdmin.get(key);
      if (!existing) {
        const copy = { ...row };
        if (nameRaw) copy[options.level.nameField] = nameRaw;
        byAdmin.set(key, copy);
        continue;
      }
      for (const fname of options.fieldNames) {
        const a = Number(attrGet(existing, fname)) || 0;
        const b = Number(attrGet(row, fname)) || 0;
        existing[fname] = a + b;
      }
    }
    merged = Array.from(byAdmin.values());
  }

  if (options.crimeFilters?.unit) {
    const u = options.crimeFilters.unit.trim().toLowerCase();
    merged = merged.filter((r) => {
      const unit = normalizeKeyPart(attrGet(r, "unit") ?? attrGet(r, "Unit"));
      const code = normalizeKeyPart(attrGet(r, "custom_unit_code") ?? attrGet(r, "Custom_Unit_Code"));
      return unit === u || code === u;
    });
  }

  if (options.orderByFields?.length) {
    const spec = options.orderByFields[0]!;
    const desc = /\sDESC$/i.test(spec);
    const field = spec.replace(/\s+(ASC|DESC)$/i, "").trim();
    merged = [...merged].sort((a, b) => {
      const av = Number(attrGet(a, field));
      const bv = Number(attrGet(b, field));
      const an = Number.isFinite(av) ? av : 0;
      const bn = Number.isFinite(bv) ? bv : 0;
      return desc ? bn - an : an - bn;
    });
  }

  if (typeof options.num === "number" && options.num > 0) {
    merged = merged.slice(0, options.num);
  }

  return merged;
}

export async function unitsForLevelSelection(options: {
  map: MapLike;
  level: AdminLevel;
  layer: EsriLayer;
  where?: string;
  geometry?: unknown | null;
}): Promise<string[]> {
  const rows = await queryJoinedAttributes({
    map: options.map,
    level: options.level,
    layer: options.layer,
    where: options.where,
    geometry: options.geometry,
    outFields: ["unit", "custom_unit_code", "Unit", "Custom_Unit_Code", options.level.nameField],
  });
  const units = new Set<string>();
  for (const row of rows) {
    const u = String(attrGet(row, "unit") ?? attrGet(row, "Unit") ?? "").trim();
    if (u) units.add(u);
  }
  return Array.from(units);
}

