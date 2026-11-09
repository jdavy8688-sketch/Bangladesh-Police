/**
 * Crime unit cascade + trend series helpers.
 * Split from table-join so Vercel builds even if table-join is an older copy.
 */
import { sortMonths, type AdminLevelId, type CrimeFilters, ADMIN_LEVELS } from "@/config/layers";
import { rowMatchesDateFilter } from "@/lib/gis/date-filter";
import {
  findAdminTable,
  findCrimeTable,
  loadTableRows,
  type MapLike,
} from "@/lib/gis/table-join";

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

function normalizePlaceName(value: unknown): string {
  let s = normalizeKeyPart(value);
  if (!s) return s;
  s = s.replace(/\s+/g, " ");
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

function rowMatchesCrimeFilters(
  row: Record<string, unknown>,
  filters?: Partial<CrimeFilters> | null,
  unitSet?: Set<string> | null,
): boolean {
  const unit = String(attrGet(row, "Unit") ?? "").trim();
  const code = String(attrGet(row, "Custom_Unit_Code") ?? "").trim();
  const unitNorm = normalizePlaceName(unit);
  if (filters?.unit) {
    const f = filters.unit.trim().toLowerCase();
    const fNorm = normalizePlaceName(filters.unit);
    if (unit.toLowerCase() !== f && unitNorm !== fNorm && code.toLowerCase() !== f) {
      return false;
    }
  } else if (unitSet && unitSet.size) {
    const hit =
      unitSet.has(unit.toLowerCase()) ||
      unitSet.has(unitNorm) ||
      (code && unitSet.has(code.toLowerCase())) ||
      (code && unitSet.has(code));
    if (!hit) return false;
  }
  // Prefer unified dateFilter (Date Range picker). Fall back to legacy year/month.
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

/** Crime Unit name (DMP) → Custom_Unit_Code values in Crime_Data. */
export async function codesForCrimeUnitName(
  map: MapLike,
  unitName: string,
): Promise<string[]> {
  const table = findCrimeTable(map);
  if (!table || !unitName?.trim()) return [];
  const { rows } = await loadTableRows(map, table);
  const want = unitName.trim().toLowerCase();
  const codes = new Set<string>();
  for (const row of rows) {
    const u = String(attrGet(row, "Unit") ?? "").trim().toLowerCase();
    if (u !== want) continue;
    const code = String(attrGet(row, "Custom_Unit_Code") ?? "").trim();
    if (code) codes.add(code);
  }
  return [...codes];
}

/** Admin place names for a crime unit via Custom_Unit_Code / Unit on geometry or table. */
export async function adminNamesForCrimeUnit(options: {
  map: MapLike;
  levelId: AdminLevelId;
  unitName: string;
  division?: string | null;
  district?: string | null;
  upazila?: string | null;
}): Promise<string[]> {
  const codes = await codesForCrimeUnitName(options.map, options.unitName);
  const level = ADMIN_LEVELS.find((l) => l.id === options.levelId);
  if (!level) return [];

  // Prefer boundary layer attributes (new web map: indicators + Unit on geometry)
  let rows: Array<Record<string, unknown>> = [];
  const boundary = options.map.findLayer(level.layerTitles.boundary);
  if (boundary) {
    try {
      const features = await options.map.queryAttributes(boundary, {
        where: "1=1",
        outFields: ["*"],
        returnGeometry: false,
        num: 50_000,
        ignoreDefinitionExpression: true,
      });
      rows = features.map((f) => ({ ...(f.attributes ?? {}) }));
    } catch {
      rows = [];
    }
  }
  if (!rows.length) {
    const table = findAdminTable(options.map, options.levelId);
    if (!table) return [];
    const loaded = await loadTableRows(options.map, table);
    rows = loaded.rows;
  }

  const codeSet = new Set(codes.map((c) => c.toLowerCase()));
  const names = new Set<string>();
  const unitWant = options.unitName.trim().toLowerCase();
  const divWant = options.division ? normalizePlaceName(options.division) : null;
  const distWant = options.district ? normalizePlaceName(options.district) : null;
  const upzWant = options.upazila ? normalizePlaceName(options.upazila) : null;
  for (const row of rows) {
    const code = String(
      attrGet(row, "Custom_Unit_Code") ?? attrGet(row, "custom_unit_code") ?? "",
    )
      .trim()
      .toLowerCase();
    const u = String(attrGet(row, "Unit") ?? "").trim().toLowerCase();
    if (codeSet.size) {
      if (!code || !codeSet.has(code)) {
        if (u !== unitWant) continue;
      }
    } else if (u !== unitWant) {
      continue;
    }
    if (divWant) {
      const d = normalizePlaceName(attrGet(row, "adm1_en"));
      if (d !== divWant) continue;
    }
    if (distWant && (options.levelId === "upazila" || options.levelId === "union")) {
      const d = normalizePlaceName(attrGet(row, "adm2_en"));
      if (d !== distWant) continue;
    }
    if (upzWant && options.levelId === "union") {
      const d = normalizePlaceName(attrGet(row, "adm3_en"));
      if (d !== upzWant) continue;
    }
    const name = String(attrGet(row, level.nameField) ?? "").trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Unit dropdown: Crime_Data names filtered by division via Custom_Unit_Code.
 * (Admin tables use different Unit labels than Crime_Data.)
 */
export async function loadCascadedUnitOptions(
  map: MapLike,
  division: string | null,
): Promise<string[]> {
  const crimeTable = findCrimeTable(map);
  if (!crimeTable) return [];
  const { rows: crimeRows } = await loadTableRows(map, crimeTable);

  if (!division || !division.trim()) {
    const units = new Set<string>();
    for (const row of crimeRows) {
      const u = String(attrGet(row, "Unit") ?? "").trim();
      if (u) units.add(u);
    }
    return [...units].sort((a, b) => a.localeCompare(b));
  }

  const codes = new Set<string>();
  const divWanted = normalizePlaceName(division);
  // Collect Custom_Unit_Code from geometry layers first (new web map), then optional tables
  for (const levelId of ["division", "district"] as AdminLevelId[]) {
    const level = ADMIN_LEVELS.find((l) => l.id === levelId);
    if (!level) continue;
    const sources: Array<{ kind: "layer" | "table"; title: string }> = [
      { kind: "layer", title: level.layerTitles.boundary },
      { kind: "table", title: level.tableTitle },
    ];
    for (const src of sources) {
      try {
        if (src.kind === "layer") {
          const layer = map.findLayer(src.title);
          if (!layer) continue;
          const features = await map.queryAttributes(layer, {
            where: "1=1",
            outFields: ["*"],
            returnGeometry: false,
            num: 50_000,
            ignoreDefinitionExpression: true,
          });
          for (const f of features) {
            const row = f.attributes ?? {};
            const d = normalizePlaceName(attrGet(row, "adm1_en"));
            if (d !== divWanted) continue;
            const code = String(
              attrGet(row, "Custom_Unit_Code") ?? attrGet(row, "custom_unit_code") ?? "",
            ).trim();
            if (code) codes.add(code.toLowerCase());
          }
        } else {
          const table = findAdminTable(map, levelId);
          if (!table) continue;
          const { rows } = await loadTableRows(map, table);
          for (const row of rows) {
            const d = normalizePlaceName(attrGet(row, "adm1_en"));
            if (d !== divWanted) continue;
            const code = String(
              attrGet(row, "Custom_Unit_Code") ?? attrGet(row, "custom_unit_code") ?? "",
            ).trim();
            if (code) codes.add(code.toLowerCase());
          }
        }
      } catch {
        /* optional */
      }
    }
  }

  if (!codes.size) {
    const STATIC: Record<string, string[]> = {
      barisal: ["10", "11"],
      dhaka: ["30", "31", "32"],
      chittagong: ["20", "21"],
      khulna: ["40", "41"],
      rajshahi: ["50", "51"],
      rangpur: ["55", "56"],
      mymensingh: ["45"],
      sylhet: ["60", "61"],
    };
    for (const c of STATIC[divWanted] ?? []) codes.add(c);
  }

  const units = new Set<string>();
  for (const row of crimeRows) {
    const code = String(attrGet(row, "Custom_Unit_Code") ?? "").trim().toLowerCase();
    if (codes.size && !codes.has(code)) continue;
    const u = String(attrGet(row, "Unit") ?? "").trim();
    if (u) units.add(u);
  }
  return [...units].sort((a, b) => a.localeCompare(b));
}

export type CrimeTrendPoint = {
  period: string;
  values: Record<string, number>;
};

export async function queryCrimeTrends(options: {
  map: MapLike;
  fieldNames: string[];
  crimeFilters?: Partial<CrimeFilters> | null;
  units?: string[] | null;
}): Promise<{ yearly: CrimeTrendPoint[]; monthly: CrimeTrendPoint[] }> {
  const table = findCrimeTable(options.map);
  if (!table || !options.fieldNames.length) {
    return { yearly: [], monthly: [] };
  }
  const { rows } = await loadTableRows(options.map, table);
  const unitSet =
    options.units?.length
      ? new Set(options.units.map((u) => u.trim().toLowerCase()).filter(Boolean))
      : null;

  const byYear = new Map<string, Record<string, number>>();
  const byMonth = new Map<string, Record<string, number>>();

  for (const row of rows) {
    if (!rowMatchesCrimeFilters(row, options.crimeFilters, unitSet)) continue;

    const y = String(attrGet(row, "year") ?? "").trim();
    const m = String(attrGet(row, "month") ?? "").trim();

    if (y) {
      let bag = byYear.get(y);
      if (!bag) {
        bag = Object.fromEntries(options.fieldNames.map((f) => [f, 0]));
        byYear.set(y, bag);
      }
      for (const name of options.fieldNames) {
        const n = Number(attrGet(row, name));
        if (Number.isFinite(n)) bag[name] = (bag[name] ?? 0) + n;
      }
    }
    if (m) {
      let bag = byMonth.get(m);
      if (!bag) {
        bag = Object.fromEntries(options.fieldNames.map((f) => [f, 0]));
        byMonth.set(m, bag);
      }
      for (const name of options.fieldNames) {
        const n = Number(attrGet(row, name));
        if (Number.isFinite(n)) bag[name] = (bag[name] ?? 0) + n;
      }
    }
  }

  const yearly: CrimeTrendPoint[] = [...byYear.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]))
    .map(([period, values]) => ({ period, values }));

  const monthly: CrimeTrendPoint[] = sortMonths([...byMonth.keys()]).map((period) => ({
    period,
    values: byMonth.get(period) ?? {},
  }));

  return { yearly, monthly };
}
