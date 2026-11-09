/**
 * Administrative levels and how they map onto the web map.
 *
 * Scale ranges are copied from the published web map group layers so analytics
 * follow the same Division → Union visibility as the map. Adjust `minScale` /
 * `maxScale` / `layerTitles` if you point the app at a different web map.
 *
 * Layer groups:
 *   - Boundary — filled polygons (bivariate / ternary / choropleth / predominant)
 *   - Chart    — pie charts drawn on the same polygons (size = total or a field)
 *
 * Indicator attributes (Incident, Demography, Socio-Economic, POI) live on the
 * boundary/chart geometry layers themselves (Division → Union attribute tables).
 * No admin indicator table join is required. Optional `tableTitle` is kept only
 * for legacy maps that still host Division.csv / District.csv / etc.
 *
 * Join rules:
 *   - Crime_Data hosted table → join on Unit only
 *   - All other indicators → administrative name fields:
 *       Division adm1_en, District adm2_en, Upazila adm3_en, Union adm4_en
 *   - Mixed selection: Crime values join on Unit; other indicators on adm* fields
 * Chart pie positions use service centroids from the geometry layers.
 */

import { emptyDateFilter, type DateFilterState } from "@/lib/gis/date-filter";

export const LAYER_GROUPS = [
  {
    id: "boundary" as const,
    label: "Boundary",
  },
  {
    id: "chart" as const,
    label: "Chart",
  },
];

export type LayerGroupId = (typeof LAYER_GROUPS)[number]["id"];

export type AdminLevelId = "division" | "district" | "upazila" | "union";

export type AdminLevel = {
  id: AdminLevelId;
  label: string;
  shortLabel: string;
  /** Feature attribute that holds the display name at this level. */
  nameField: string;
  codeField: string;
  parentId: AdminLevelId | null;
  parentNameField: string | null;
  /** Group layer title in the web map. */
  groupTitle: string;
  layerTitles: {
    boundary: string;
    chart: string;
  };
  /** Hosted table title in the web map (indicator attributes). */
  tableTitle: string;
  /**
   * Fields used to join the geometry layer to the hosted table.
   * Prefer Unit + admin name; fall back to whichever exist on both sides.
   */
  tableJoinFields: string[];
  /**
   * Esri scale visibility (same contract as FeatureLayer.minScale / maxScale):
   * visible when (minScale === 0 || scale <= minScale) && (maxScale === 0 || scale >= maxScale).
   */
  minScale: number;
  maxScale: number;
  /** Comfortable scale used by “View this level on the map”. */
  viewScale: number;
};

export const ADMIN_LEVELS: AdminLevel[] = [
  {
    id: "division",
    label: "Division",
    shortLabel: "Div",
    nameField: "adm1_en",
    codeField: "adm1_pcode",
    parentId: null,
    parentNameField: null,
    groupTitle: "Division",
    layerTitles: {
      boundary: "Division Boundary",
      chart: "Division Chart",
    },
    tableTitle: "Division.csv",
    tableJoinFields: ["adm1_en"],
    minScale: 0,
    maxScale: 2_629_532,
    viewScale: 4_200_000,
  },
  {
    id: "district",
    label: "District",
    shortLabel: "Dist",
    nameField: "adm2_en",
    codeField: "adm2_pcode",
    parentId: "division",
    parentNameField: "adm1_en",
    groupTitle: "District",
    layerTitles: {
      boundary: "District Boundary",
      chart: "District Chart",
    },
    tableTitle: "District.csv",
    tableJoinFields: ["adm2_en"],
    minScale: 2_629_532,
    maxScale: 689_316,
    viewScale: 1_350_000,
  },
  {
    id: "upazila",
    label: "Upazila",
    shortLabel: "Upz",
    nameField: "adm3_en",
    codeField: "adm3_pcode",
    parentId: "district",
    parentNameField: "adm2_en",
    groupTitle: "Upazila",
    layerTitles: {
      boundary: "Upazila Boundary",
      chart: "Upazila Chart",
    },
    tableTitle: "Upazila.csv",
    tableJoinFields: ["adm3_en"],
    minScale: 689_319,
    maxScale: 115_648,
    viewScale: 260_000,
  },
  {
    id: "union",
    label: "Union / Ward",
    shortLabel: "Union",
    nameField: "adm4_en",
    codeField: "adm4_pcode",
    parentId: "upazila",
    parentNameField: "adm3_en",
    groupTitle: "Union",
    layerTitles: {
      boundary: "Union Boundary",
      chart: "Union Chart",
    },
    tableTitle: "Union.csv",
    tableJoinFields: ["adm4_en"],
    minScale: 115_648,
    maxScale: 0,
    viewScale: 36_000,
  },
];

/**
 * Crime time-series hosted table (by unit / custom_unit_code / year / month).
 * Web map title is typically "Crime Data" (also matches Crime_Data.csv).
 * Field names on the service are lowercase: unit, custom_unit_code, total_cases, …
 * Join to geometry layers is by custom_unit_code (Crime unit "DMP" ≠ layer unit
 * "Dhaka City Corporation"; both share code 31).
 */
export const CRIME_TABLE = {
  title: "Crime Data",
  /** Alternate titles to try when discovering the table on the web map. */
  titleAliases: ["Crime_Data.csv", "Crime_Data", "CrimeData", "Crime Data.csv"],
  /** Crime_Data joins to geometry on Unit only (not adm* fields). */
  joinFields: ["unit", "Unit"],
} as const;

/** Calendar month order for filter dropdowns. */
export const MONTH_ORDER = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function getAdminLevel(id: AdminLevelId): AdminLevel {
  const found = ADMIN_LEVELS.find((level) => level.id === id);
  if (!found) throw new Error(`Unknown admin level: ${id}`);
  return found;
}

export function ancestorsOf(id: AdminLevelId): AdminLevel[] {
  const result: AdminLevel[] = [];
  let current: AdminLevel | undefined = getAdminLevel(id);
  while (current) {
    result.unshift(current);
    current = current.parentId ? getAdminLevel(current.parentId) : undefined;
  }
  return result;
}

export function scaleToLevel(scale: number): AdminLevelId {
  const finestFirst = [...ADMIN_LEVELS].reverse();
  for (const level of finestFirst) {
    const minOk = level.minScale === 0 || scale <= level.minScale;
    const maxOk = level.maxScale === 0 || scale >= level.maxScale;
    if (minOk && maxOk) return level.id;
  }
  return "division";
}

export const FILTER_KEYS: AdminLevelId[] = ["division", "district", "upazila", "union"];

export type LocationFilters = Record<AdminLevelId, string | null>;

/** Crime_Data temporal / unit filters (independent of admin geography). */
export type CrimeFilters = {
  unit: string | null;
  /** Legacy exact year — still used when dateFilter.mode === "exact" */
  year: string | null;
  /** Legacy exact month */
  month: string | null;
  /** Unified Date filter (ArcGIS Dashboard–style presets + range) */
  dateFilter: DateFilterState;
};

export function emptyFilters(): LocationFilters {
  return { division: null, district: null, upazila: null, union: null };
}

export function emptyCrimeFilters(): CrimeFilters {
  return { unit: null, year: null, month: null, dateFilter: emptyDateFilter() };
}

export function deepestFilter(filters: LocationFilters): AdminLevel | null {
  for (const level of [...ADMIN_LEVELS].reverse()) {
    if (filters[level.id]) return level;
  }
  return null;
}

export function sortMonths(values: string[]): string[] {
  const rank = new Map(MONTH_ORDER.map((m, i) => [m.toLowerCase(), i]));
  return [...values].sort((a, b) => {
    const ra = rank.get(a.toLowerCase());
    const rb = rank.get(b.toLowerCase());
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.localeCompare(b);
  });
}
