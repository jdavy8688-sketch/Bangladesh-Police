import { create } from "zustand";
import { getAppConfig } from "@/config/app-config";
import { INDICATOR_GROUPS, allIndicatorFields, kpiFieldsForGroup, labelForField } from "@/config/indicators";
import {
  ADMIN_LEVELS,
  emptyCrimeFilters,
  emptyFilters,
  getAdminLevel,
  sortMonths,
  type AdminLevelId,
  type CrimeFilters,
  type LayerGroupId,
  type LocationFilters,
} from "@/config/layers";
import type { DateFilterState } from "@/lib/gis/date-filter";
import { emptyDateFilter } from "@/lib/gis/date-filter";
import { resolveField, resolveFieldName, type FieldInfo } from "@/lib/gis/fields";
import { getMapController } from "@/lib/gis/map-controller";
import {
  loadCrimeFilterOptions,
  queryCrimeAggregates,
  queryJoinedAttributes,
  queryJoinedCrimeAttributes,
  schemaForLevel,
  sumJoinedFields,
} from "@/lib/gis/table-join";
import {
  adminNamesForCrimeUnit,
  loadCascadedUnitOptions,
  queryCrimeTrends,
  type CrimeTrendPoint,
} from "@/lib/gis/crime-helpers";
import { uniqueSorted } from "@/lib/utils";
import {
  fieldsMissingOnLayer,
  materializeJoinedBoundaryRenderer,
} from "@/lib/symbology/join-renderer";
import { buildBoundaryRenderer, buildChartRenderer, describeMethod, type AppliedLegend } from "@/lib/symbology/renderers";

export type RankingRow = {
  name: string;
  value: number;
  columns: Record<string, number>;
};

function attrValue(attrs: Record<string, unknown> | null | undefined, field: string): unknown {
  if (!attrs || !field) return undefined;
  if (Object.prototype.hasOwnProperty.call(attrs, field)) return attrs[field];
  const lower = field.toLowerCase();
  for (const key of Object.keys(attrs)) {
    if (key.toLowerCase() === lower) return attrs[key];
  }
  return undefined;
}

function attrNumber(attrs: Record<string, unknown> | null | undefined, field: string): number {
  const n = Number(attrValue(attrs, field));
  return Number.isFinite(n) ? n : 0;
}


export type KpiValue = {
  id: string;
  label: string;
  value: number | null;
};

export type CompositionSlice = {
  id: string;
  label: string;
  value: number;
};

export type CrimeFilterKey = "unit" | "year" | "month";

export type CrimeFilterOptions = {
  units: string[];
  years: string[];
  months: string[];
};

function emptyCrimeFilterOptions(): CrimeFilterOptions {
  return { units: [], years: [], months: [] };
}

type Toast = { kind: "success" | "danger" | "info"; message: string } | null;

const RANKING_COLUMN_COUNT = 3;

/** Map KPI bar — top crimes from Crime_Data (independent of analytics group). */
const MAP_CRIME_KPI_IDS = [
  "total_cases",
  "murder",
  "robbery",
  "dacoity",
  "theft",
] as const;

/** Trend lines for Crimes analytics — individual crime types only (no total_cases). */
const CRIME_TREND_FIELD_IDS = [
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

function defaultRankingColumns(groupId: string): string[] {
  const group = INDICATOR_GROUPS.find((g) => g.id === groupId);
  const ids = (group?.fields ?? []).map((f) => f.id);
  return ids.slice(0, RANKING_COLUMN_COUNT);
}

type SymFieldsByGroup = Record<LayerGroupId, string[]>;

export type SelectionAncestor = {
  label: string;
  value: string;
};

export type SelectionInfo = {
  unitLabel: string;
  areaName: string;
  ancestors: SelectionAncestor[];
};

type AppState = {
  mapReady: boolean;
  mapError: string | null;
  mapScale: number;
  levelMode: "auto" | "manual";
  autoLevel: AdminLevelId;
  manualLevel: AdminLevelId;
  filters: LocationFilters;
  filterOptions: Record<AdminLevelId, string[]>;
  crimeFilters: CrimeFilters;
  crimeFilterOptions: CrimeFilterOptions;
  analyticsGroup: string;
  analyticsMetric: string;
  rankingColumns: string[];
  kpis: KpiValue[];
  mapIncidentKpis: KpiValue[];
  ranking: RankingRow[];
  composition: CompositionSlice[];
  /** Crimes group: yearly + monthly series for top crime fields */
  crimeTrends: { yearly: CrimeTrendPoint[]; monthly: CrimeTrendPoint[] };
  featureCount: number;
  analyticsLoading: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  toast: Toast;
  selectionName: string | null;
  selectionGeometry: unknown | null;
  selectionInfo: SelectionInfo | null;
  symLayerGroup: LayerGroupId;
  symAdminLevel: AdminLevelId | "all";
  symBrowseGroup: string | null;
  symFieldsByGroup: SymFieldsByGroup;
  symScheme: string;
  symSizeField: string;
  symApplying: boolean;
  applied: Record<LayerGroupId, AppliedLegend | null>;
  currentLevel: () => AdminLevelId;
  currentSymFields: () => string[];
  setMapReady: (ready: boolean) => void;
  setMapError: (message: string | null) => void;
  setScale: (level: AdminLevelId, scale: number) => void;
  setLevelMode: (mode: "auto" | "manual") => void;
  setManualLevel: (level: AdminLevelId) => void;
  setFilter: (level: AdminLevelId, value: string | null) => Promise<void>;
  setCrimeFilter: (key: CrimeFilterKey, value: string | null) => Promise<void>;
  setDateFilter: (next: DateFilterState) => Promise<void>;
  clearFilters: () => Promise<void>;
  refreshFilterOptions: () => Promise<void>;
  refreshAnalytics: () => Promise<void>;
  setAnalyticsGroup: (id: string) => void;
  setRankingColumn: (index: number, fieldId: string) => void;
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setSymLayerGroup: (id: LayerGroupId) => void;
  setSymAdminLevel: (id: AdminLevelId | "all") => void;
  setSymBrowseGroup: (id: string | null) => void;
  toggleSymField: (id: string) => void;
  removeSymField: (id: string) => void;
  setSymScheme: (scheme: string) => void;
  setSymSizeField: (id: string) => void;
  applySymbology: () => Promise<void>;
  resetSymbology: (group?: LayerGroupId) => void;
  zoomToLevel: (level: AdminLevelId) => Promise<void>;
  zoomToName: (name: string) => Promise<void>;
  clearRankingSelection: () => void;
  setMapSelection: (name: string | null, geometry: unknown | null, info?: SelectionInfo | null) => void;
  clearMapSelection: () => void;
  showToast: (toast: Toast) => void;
};

function nextFilters(current: LocationFilters, level: AdminLevelId, value: string | null): LocationFilters {
  const next = { ...current, [level]: value };
  const ids: AdminLevelId[] = ["division", "district", "upazila", "union"];
  const idx = ids.indexOf(level);
  for (const child of ids.slice(idx + 1)) next[child] = null;
  return next;
}

const initialGroup = getAppConfig().defaultAnalyticsGroup;
const initialColumns = defaultRankingColumns(initialGroup);

let analyticsRequestId = 0;

export const useAppStore = create<AppState>((set, get) => ({
  mapReady: false,
  mapError: null,
  mapScale: 0,
  levelMode: "auto",
  autoLevel: "division",
  manualLevel: "division",
  filters: emptyFilters(),
  filterOptions: { division: [], district: [], upazila: [], union: [] },
  crimeFilters: emptyCrimeFilters(),
  crimeFilterOptions: emptyCrimeFilterOptions(),
  analyticsGroup: initialGroup,
  analyticsMetric: initialColumns[0] ?? getAppConfig().defaultMetric,
  rankingColumns: initialColumns,
  kpis: [],
  mapIncidentKpis: [],
  ranking: [],
  composition: [],
  crimeTrends: { yearly: [], monthly: [] },
  featureCount: 0,
  analyticsLoading: false,
  leftOpen: true,
  rightOpen: true,
  toast: null,
  selectionName: null,
  selectionGeometry: null,
  selectionInfo: null,
  symLayerGroup: "boundary",
  symAdminLevel: "all",
  symBrowseGroup: INDICATOR_GROUPS[0]?.id ?? null,
  symFieldsByGroup: { boundary: [], chart: [] },
  symScheme: "Auto",
  symSizeField: "",
  symApplying: false,
  applied: { boundary: null, chart: null },

  currentLevel: () => (get().levelMode === "auto" ? get().autoLevel : get().manualLevel),

  currentSymFields: () => {
    const { symLayerGroup, symFieldsByGroup } = get();
    return symFieldsByGroup[symLayerGroup] ?? [];
  },

  setMapReady: (ready) => {
    set({ mapReady: ready });
    if (ready) {
      void get().refreshFilterOptions();
      void get().refreshAnalytics();
    }
  },
  setMapError: (message) => set({ mapError: message }),
  setScale: (level, scale) => {
    set({ autoLevel: level, mapScale: scale });
  },
  setLevelMode: (mode) => {
    set({ levelMode: mode, manualLevel: get().autoLevel });
    void get().refreshAnalytics();
  },
  setManualLevel: (level) => {
    set({ manualLevel: level, levelMode: "manual" });
    void get().refreshAnalytics();
  },
  setFilter: async (level, value) => {
    const filters = nextFilters(get().filters, level, value);
    let crimeFilters = get().crimeFilters;
    // Division → Unit cascade: changing division clears unit (and lower crime filters stay)
    if (level === "division") {
      crimeFilters = { ...crimeFilters, unit: null };
    }
    // Update store first so blue mark / cascade UI react immediately
    set({ filters, crimeFilters, selectionName: null, selectionGeometry: null, selectionInfo: null });
    const map = getMapController();
    try {
      if (map) await map.applyFilters(filters, crimeFilters.unit);
    } catch {
      /* map apply is best-effort; UI state already committed */
    }
    await get().refreshFilterOptions();
    await get().refreshAnalytics();
  },
  setCrimeFilter: async (key, value) => {
    const crimeFilters = { ...get().crimeFilters, [key]: value };
    let filters = get().filters;
    // Unit → District → Upazila → Union cascade
    if (key === "unit") {
      filters = { ...filters, district: null, upazila: null, union: null };
      // keep year/month so trends stay scoped unless user clears them
    } else if (key === "year") {
      crimeFilters.month = null;
    }
    // Update store first so Unit blue mark + District enable react immediately
    set({ crimeFilters, filters, selectionName: null, selectionGeometry: null, selectionInfo: null });
    const map = getMapController();
    try {
      if (map) await map.applyFilters(filters, crimeFilters.unit);
    } catch {
      /* map apply is best-effort; UI state already committed */
    }
    await get().refreshFilterOptions();
    await get().refreshAnalytics();
  },

  setDateFilter: async (next) => {
    const crimeFilters = {
      ...get().crimeFilters,
      dateFilter: next ?? emptyDateFilter(),
      year: next?.mode === "exact" ? next.year : null,
      month: next?.mode === "exact" ? next.month : null,
    };
    const filters = get().filters;
    set({ crimeFilters, selectionName: null, selectionGeometry: null, selectionInfo: null });
    const map = getMapController();
    try {
      if (map) await map.applyFilters(filters, crimeFilters.unit);
    } catch {
      /* map apply is best-effort; UI state already committed */
    }
    await get().refreshFilterOptions();
    await get().refreshAnalytics();
  },
  clearFilters: async () => {
    const filters = emptyFilters();
    const crimeFilters = emptyCrimeFilters();
    set({
      filters,
      crimeFilters,
      selectionName: null,
      selectionGeometry: null,
      selectionInfo: null,
    });
    const map = getMapController();
    try {
      if (map) {
        await map.applyFilters(filters, null);
        await map.resetExtent();
      }
    } catch {
      /* map apply is best-effort; UI state already committed */
    }
    await get().refreshFilterOptions();
    await get().refreshAnalytics();
  },
  refreshFilterOptions: async () => {
    const map = getMapController();
    if (!map) return;
    const { filters, crimeFilters } = get();
    const options: Record<AdminLevelId, string[]> = { division: [], district: [], upazila: [], union: [] };

    for (const level of ADMIN_LEVELS) {
      // Cascade readiness: Division free; District needs Unit; Upazila needs District; Union needs Upazila
      if (level.id === "district" && !crimeFilters.unit) {
        options.district = [];
        continue;
      }
      if (level.id === "upazila" && !filters.district) {
        options.upazila = [];
        continue;
      }
      if (level.id === "union" && !filters.upazila) {
        options.union = [];
        continue;
      }

      const layer = map.findLayer(level.layerTitles.boundary);
      if (!layer) continue;
      const nameField = resolveFieldName(map.schemaOf(layer), level.nameField) ?? level.nameField;

      const clauses: string[] = [];
      if (level.id !== "division" && filters.division) {
        const pField = resolveFieldName(map.schemaOf(layer), "adm1_en") ?? "adm1_en";
        clauses.push(`${pField} = '${filters.division.replaceAll("'", "''")}'`);
      }
      if (level.parentId && level.id !== "district") {
        const parent = getAdminLevel(level.parentId);
        const pValue = filters[parent.id];
        if (pValue) {
          const pField = resolveFieldName(map.schemaOf(layer), parent.nameField) ?? parent.nameField;
          clauses.push(`${pField} = '${pValue.replaceAll("'", "''")}'`);
        }
      }
      if (crimeFilters.unit && level.id !== "division") {
        const unitField = resolveFieldName(map.schemaOf(layer), "Unit") ?? "Unit";
        clauses.push(`${unitField} = '${crimeFilters.unit.replaceAll("'", "''")}'`);
      }

      const parentWhere = clauses.length ? clauses.join(" AND ") : "1=1";

      // Crime Unit names (DMP) ≠ admin Unit labels — resolve via Custom_Unit_Code
      if (crimeFilters.unit && level.id !== "division") {
        try {
          const loaded = await adminNamesForCrimeUnit({
            map,
            levelId: level.id,
            unitName: crimeFilters.unit,
            division: filters.division,
            district: filters.district,
            upazila: filters.upazila,
          });
          if (loaded.length) {
            options[level.id] = loaded;
            continue;
          }
        } catch {
          /* fall through to geometry query */
        }
      }

      try {
        const features = await map.queryAttributes(layer, {
          where: parentWhere,
          outFields: [nameField],
          returnDistinctValues: true,
          returnGeometry: false,
          orderByFields: [nameField],
          num: 5000,
        });
        options[level.id] = uniqueSorted(features.map((f) => String(f.attributes[nameField] ?? "")));
      } catch {
        try {
          const features = await map.queryAttributes(layer, {
            where: parentWhere,
            outFields: [nameField],
            returnGeometry: false,
            num: 5000,
          });
          options[level.id] = uniqueSorted(features.map((f) => String(f.attributes[nameField] ?? "")));
        } catch {
          options[level.id] = [];
        }
      }
    }

    let crimeFilterOptions = emptyCrimeFilterOptions();
    try {
      const loaded = await loadCrimeFilterOptions(map);
      // Always load units: all when no division; division-scoped when set
      let units: string[] = loaded.units;
      try {
        units = await loadCascadedUnitOptions(map, filters.division);
      } catch {
        units = loaded.units;
      }
      crimeFilterOptions = {
        units,
        years: loaded.years,
        months: sortMonths(loaded.months),
      };
    } catch {
      /* optional */
    }
    set({ filterOptions: options, crimeFilterOptions });
  },
  refreshAnalytics: async () => {
    const map = getMapController();
    if (!map) return;
    const state = get();
    const level = getAdminLevel(state.currentLevel());
    const layer = map.findLayer(level.layerTitles.boundary);
    if (!layer) return;
    const requestId = ++analyticsRequestId;
    set({ analyticsLoading: true });
    try {
      const where = layer.definitionExpression || "1=1";
      const geometry = state.selectionGeometry ?? map.currentExtent();
      const count = await map.queryCount(layer, where, geometry);

      const group = INDICATOR_GROUPS.find((g) => g.id === state.analyticsGroup);
      const isCrimeSource = group?.source === "crime";
      const groupFields = group?.fields ?? [];
      const kpiFieldDefs = kpiFieldsForGroup(state.analyticsGroup);
      const crimeFilters = state.crimeFilters;

      // Units scoped by Division (when no explicit Unit filter) so KPIs/ranking match filters
      let scopedUnits: string[] | null = null;
      if (crimeFilters.unit) {
        scopedUnits = [crimeFilters.unit];
      } else if (state.filters.division) {
        try {
          scopedUnits = await loadCascadedUnitOptions(map, state.filters.division);
        } catch {
          scopedUnits = null;
        }
      }

      // --- Map KPI bar: always Crime_Data totals ---
      let mapIncidentKpis: KpiValue[] = MAP_CRIME_KPI_IDS.map((id) => ({
        id,
        label: labelForField(id),
        value: null,
      }));
      try {
        const mapAgg = await queryCrimeAggregates({
          map,
          fieldNames: [...MAP_CRIME_KPI_IDS],
          crimeFilters,
          units: scopedUnits,
        });
        mapIncidentKpis = MAP_CRIME_KPI_IDS.map((id) => ({
          id,
          label: labelForField(id),
          value: Number.isFinite(mapAgg.totals[id]) ? mapAgg.totals[id]! : null,
        }));
      } catch {
        /* Crime_Data optional until table is on the web map */
      }

      let kpiValues: KpiValue[] = kpiFieldDefs.map((f) => ({
        id: f.id,
        label: f.label,
        value: null,
      }));
      let composition: CompositionSlice[] = [];
      let ranking: RankingRow[] = [];
      let primaryId: string | undefined;

      const columnIds = state.rankingColumns.length
        ? state.rankingColumns
        : defaultRankingColumns(state.analyticsGroup);
      const rankingLimit = getAppConfig().rankingRows;
      const rankingGeometry = state.selectionGeometry;

      if (isCrimeSource) {
        // Values live on Crime_Data.csv — not on boundary layer attributes
        const allFieldIds = Array.from(
          new Set([
            ...kpiFieldDefs.map((f) => f.id),
            ...groupFields.map((f) => f.id),
            ...columnIds,
          ]),
        );
        const crimeAgg = await queryCrimeAggregates({
          map,
          fieldNames: allFieldIds,
          crimeFilters,
          units: scopedUnits,
        });

        kpiValues = kpiFieldDefs.map((f) => ({
          id: f.id,
          label: f.label,
          value: Number.isFinite(crimeAgg.totals[f.id]) ? crimeAgg.totals[f.id]! : null,
        }));

        composition = groupFields.map((f) => ({
          id: f.id,
          label: f.label,
          value: Number.isFinite(crimeAgg.totals[f.id]) ? crimeAgg.totals[f.id]! : 0,
        }));

        const resolvedColumns = columnIds.map((id) => ({
          id,
          name: id,
          label: labelForField(id),
        }));
        primaryId = resolvedColumns[0]?.id;
        if (primaryId) {
          const rows = await queryJoinedCrimeAttributes({
            map,
            level,
            layer,
            fieldNames: resolvedColumns.map((c) => c.name),
            where,
            geometry: rankingGeometry ?? undefined,
            crimeFilters,
            units: scopedUnits,
            num: Math.min(50_000, Math.max(rankingLimit * 20, rankingLimit)),
          });
          const nameKey = level.nameField;
          const byName = new Map<string, RankingRow>();
          for (const row of rows) {
            const name =
              String(attrValue(row, nameKey) ?? attrValue(row, "Unit") ?? "").trim() || "—";
            const columns: Record<string, number> = {};
            for (const col of resolvedColumns) {
              columns[col.id] = attrNumber(row, col.name);
            }
            const prev = byName.get(name);
            if (!prev) {
              byName.set(name, {
                name,
                value: columns[primaryId] ?? 0,
                columns: { ...columns },
              });
              continue;
            }
            for (const col of resolvedColumns) {
              prev.columns[col.id] = (prev.columns[col.id] ?? 0) + (columns[col.id] ?? 0);
            }
            prev.value = prev.columns[primaryId] ?? 0;
          }
          ranking = Array.from(byName.values())
            .sort((a, b) => b.value - a.value)
            .slice(0, rankingLimit);
        }
      } else {
        // Admin tables (Division.csv / District.csv / …) joined to boundary geometry
        const schema = await schemaForLevel(map, level, layer);
        const nameField = resolveFieldName(schema, level.nameField) ?? level.nameField;

        const kpiNames: string[] = [];
        const kpiMeta: Array<{ id: string; label: string; name: string }> = [];
        for (const field of kpiFieldDefs) {
          const resolved = resolveFieldName(schema, field.id);
          if (!resolved) continue;
          kpiNames.push(resolved);
          kpiMeta.push({ id: field.id, label: field.label, name: resolved });
        }
        if (kpiNames.length) {
          const sums = await sumJoinedFields({
            map,
            level,
            layer,
            fieldNames: kpiNames,
            where,
            geometry,
            unitFilter: crimeFilters.unit,
          });
          kpiValues = kpiFieldDefs.map((f) => {
            const meta = kpiMeta.find((m) => m.id === f.id);
            const v = meta ? sums[meta.name] : undefined;
            return {
              id: f.id,
              label: f.label,
              value: v != null && Number.isFinite(v) ? v : null,
            };
          });
        }

        const compositionFields = groupFields
          .map((f) => {
            const resolved = resolveField(schema, f.id);
            return resolved ? { ...f, name: resolved.name } : null;
          })
          .filter((f): f is { id: string; label: string; name: string } => f != null);
        if (compositionFields.length) {
          const sums = await sumJoinedFields({
            map,
            level,
            layer,
            fieldNames: compositionFields.map((f) => f.name),
            where,
            geometry,
            unitFilter: crimeFilters.unit,
          });
          composition = compositionFields.map((f) => ({
            id: f.id,
            label: f.label,
            value: sums[f.name] ?? 0,
          }));
        }

        const resolvedColumns = columnIds
          .map((id) => {
            const info = resolveField(schema, id);
            return info ? { id, name: info.name, label: labelForField(id) } : null;
          })
          .filter((c): c is { id: string; name: string; label: string } => c != null);
        primaryId = resolvedColumns[0]?.id;
        if (resolvedColumns[0]) {
          const primary = resolvedColumns[0];
          const rows = await queryJoinedAttributes({
            map,
            level,
            layer,
            where,
            geometry: rankingGeometry ?? undefined,
            unitFilter: crimeFilters.unit,
            num: Math.min(50_000, Math.max(rankingLimit * 20, rankingLimit)),
          });
          const byName = new Map<string, RankingRow>();
          for (const row of rows) {
            const name = String(attrValue(row, nameField) ?? "").trim() || "—";
            const columns: Record<string, number> = {};
            for (const col of resolvedColumns) {
              columns[col.id] = attrNumber(row, col.name);
            }
            const prev = byName.get(name);
            if (!prev) {
              byName.set(name, {
                name,
                value: columns[primary.id] ?? 0,
                columns: { ...columns },
              });
              continue;
            }
            for (const col of resolvedColumns) {
              prev.columns[col.id] = (prev.columns[col.id] ?? 0) + (columns[col.id] ?? 0);
            }
            prev.value = prev.columns[primary.id] ?? 0;
          }
          ranking = Array.from(byName.values())
            .sort((a, b) => b.value - a.value)
            .slice(0, rankingLimit);
        }
      }

      // Trends for Crimes analytics (respect Unit / Year / Month filters)
      let crimeTrends: { yearly: CrimeTrendPoint[]; monthly: CrimeTrendPoint[] } = {
        yearly: [],
        monthly: [],
      };
      try {
        crimeTrends = await queryCrimeTrends({
          map,
          fieldNames: [...CRIME_TREND_FIELD_IDS],
          crimeFilters,
          units: scopedUnits,
        });
      } catch {
        /* optional */
      }

      if (requestId !== analyticsRequestId) return;
      set({
        kpis: kpiValues,
        mapIncidentKpis,
        ranking,
        composition,
        crimeTrends,
        featureCount: count,
        analyticsLoading: false,
        analyticsMetric: primaryId ?? state.analyticsMetric,
      });
    } catch (err) {
      if (requestId !== analyticsRequestId) return;
      set({
        analyticsLoading: false,
        toast: {
          kind: "danger",
          message: err instanceof Error ? err.message : "Analytics query failed.",
        },
      });
    }
  },
  setAnalyticsGroup: (id) => {
    const columns = defaultRankingColumns(id);
    set({
      analyticsGroup: id,
      rankingColumns: columns,
      analyticsMetric: columns[0] ?? get().analyticsMetric,
    });
    void get().refreshAnalytics();
  },
  setRankingColumn: (index, fieldId) => {
    const { rankingColumns } = get();
    const allowed = new Set(allIndicatorFields().map((f) => f.id));
    if (!allowed.has(fieldId)) return;
    if (rankingColumns.some((id, i) => i !== index && id === fieldId)) {
      set({
        toast: {
          kind: "info",
          message: "That indicator is already used in another column. Choose a different field.",
        },
      });
      return;
    }
    const next = [...rankingColumns];
    while (next.length <= index) next.push("");
    next[index] = fieldId;
    const cleaned = next.filter(Boolean).slice(0, RANKING_COLUMN_COUNT);
    set({
      rankingColumns: cleaned,
      analyticsMetric: cleaned[0] ?? get().analyticsMetric,
    });
    void get().refreshAnalytics();
  },
  setLeftOpen: (open) => set({ leftOpen: open }),
  setRightOpen: (open) => set({ rightOpen: open }),
  setSymLayerGroup: (id) => {
    if (get().symLayerGroup === id) return;
    set({ symLayerGroup: id });
  },
  setSymAdminLevel: (id) => set({ symAdminLevel: id }),
  setSymBrowseGroup: (id) => set({ symBrowseGroup: id }),
  toggleSymField: (id) => {
    const { symLayerGroup, symFieldsByGroup } = get();
    const current = symFieldsByGroup[symLayerGroup] ?? [];
    const max = symLayerGroup === "chart" ? getAppConfig().chartMaxIndicators : 12;
    let next: string[];
    if (current.includes(id)) {
      next = current.filter((f) => f !== id);
    } else {
      if (current.length >= max) {
        set({ toast: { kind: "info", message: `Select at most ${max} indicators for this method.` } });
        return;
      }
      next = [...current, id];
    }
    set({
      symFieldsByGroup: {
        ...symFieldsByGroup,
        [symLayerGroup]: next,
      },
    });
  },
  removeSymField: (id) => {
    const { symLayerGroup, symFieldsByGroup } = get();
    const current = symFieldsByGroup[symLayerGroup] ?? [];
    set({
      symFieldsByGroup: {
        ...symFieldsByGroup,
        [symLayerGroup]: current.filter((f) => f !== id),
      },
    });
  },
  setSymScheme: (scheme) => set({ symScheme: scheme }),
  setSymSizeField: (id) => set({ symSizeField: id }),
  applySymbology: async () => {
    const map = getMapController();
    if (!map) return;
    const { symLayerGroup, symFieldsByGroup, symScheme, symSizeField, crimeFilters } = get();
    const symFields = symFieldsByGroup[symLayerGroup] ?? [];
    const symAdminLevel = "all" as const;
    if (!symFields.length) {
      set({ toast: { kind: "info", message: "Select at least one indicator field." } });
      return;
    }
    set({ symApplying: true });
    try {
      const layers = map.layersFor(symLayerGroup, symAdminLevel);
      if (!layers.length) {
        throw new Error("No matching web map layers were found for that group / level.");
      }

      // Crime fields → Crime_Data.csv; everything else → geometry layer attributes
      // (same as the earlier working feature-class path).
      const isCrimeField = (id: string) => {
        for (const g of INDICATOR_GROUPS) {
          if (g.source === "crime" && g.fields.some((f) => f.id === id)) return true;
        }
        return false;
      };
      const crimeFieldIds = symFields.filter(isCrimeField);
      const adminFieldIds = symFields.filter((id) => !isCrimeField(id));
      const hasCrime = crimeFieldIds.length > 0;
      const hasAdmin = adminFieldIds.length > 0;

      let lastLegend: AppliedLegend | null = null;

      for (const layer of layers) {
        const levelMatch =
          ADMIN_LEVELS.find(
            (l) =>
              (layer.title || "").trim().toLowerCase() ===
              l.layerTitles[symLayerGroup].toLowerCase(),
          ) ??
          ADMIN_LEVELS.find(
            (l) =>
              (layer.title || "").trim().toLowerCase() === l.layerTitles.boundary.toLowerCase() ||
              (layer.title || "").trim().toLowerCase() === l.layerTitles.chart.toLowerCase(),
          ) ??
          ADMIN_LEVELS.find((l) => (layer.title || "").toLowerCase().includes(l.id));

        if (!levelMatch) {
          throw new Error(`Could not match admin level for layer "${layer.title}".`);
        }

        // Schema: layer fields (indicators on geometry) + synthetic crime field infos
        const layerSchema = map.schemaOf(layer);
        const schema: FieldInfo[] = [
          ...layerSchema,
          ...crimeFieldIds.map((id) => ({
            name: id,
            alias: labelForField(id),
            type: "double" as const,
          })),
        ];

        const resolved = symFields
          .map((id) => {
            if (isCrimeField(id)) {
              return { id, name: id, label: labelForField(id) };
            }
            const info = resolveField(layerSchema, id);
            return info ? { id, name: info.name, label: labelForField(id) } : null;
          })
          .filter((x): x is { id: string; name: string; label: string } => Boolean(x));

        if (!resolved.length) {
          throw new Error(
            `None of the selected fields were found on "${layer.title}". Check indicator field names on the geometry layer.`,
          );
        }

        const names = resolved.map((r) => r.name);
        const aliases = Object.fromEntries(resolved.map((r) => [r.name, r.label]));

        let sizeName: string | null = null;
        if (symSizeField) {
          if (isCrimeField(symSizeField)) {
            sizeName = symSizeField;
          } else {
            sizeName = resolveField(layerSchema, symSizeField)?.name ?? null;
          }
        }

        // --- WORKING PATH: always outFields=["*"] so Chart layers never fail
        // with "Field name 'adm2_en' does not exist" when the level field is absent.
        let features = await map.queryAttributes(layer, {
          outFields: ["*"],
          returnGeometry: false,
          ignoreDefinitionExpression: true,
        });

        let rows: Array<Record<string, unknown>> = features.map((f) => ({
          ...(f.attributes ?? {}),
        }));

        // --- ADDITIONAL: join Crime_Data when crime indicators are selected ---
        if (hasCrime) {
          const crimeNames = crimeFieldIds.slice();
          if (sizeName && isCrimeField(symSizeField) && !crimeNames.includes(sizeName)) {
            crimeNames.push(sizeName);
          }
          try {
            const crimeRows = await queryJoinedCrimeAttributes({
              map,
              level: levelMatch,
              layer,
              fieldNames: crimeNames,
              where: "1=1",
              crimeFilters,
            });
            // Crime_Data joins on Unit only; admin indicators stay on adm* rows
            const unitOf = (row: Record<string, unknown>) =>
              String(attrValue(row, "unit") ?? attrValue(row, "Unit") ?? "")
                .trim()
                .toLowerCase();
            const crimeByUnit = new Map<string, Record<string, unknown>>();
            for (const row of crimeRows) {
              const u = unitOf(row);
              if (u) crimeByUnit.set(u, row);
            }

            if (hasAdmin && rows.length) {
              rows = rows.map((row) => {
                const u = unitOf(row);
                const crime = u ? crimeByUnit.get(u) : undefined;
                return crime ? { ...row, ...crime } : row;
              });
            } else if (crimeRows.length) {
              rows = crimeRows;
            }
          } catch (e) {
            console.warn("[symbology] Crime_Data join failed", layer.title, e);
            if (!hasAdmin) throw e;
          }
        }

        if (!rows.length) {
          throw new Error(
            `No features for "${layer.title}". Zoom to a scale where the layer draws, clear filters, and confirm indicator fields exist on the layer.`,
          );
        }

        const built =
          symLayerGroup === "chart"
            ? buildChartRenderer({
                rows,
                fields: names,
                aliases,
                requestedScheme: symScheme,
                sizeField: sizeName,
                sizeLabel: sizeName ? labelForField(symSizeField) : null,
              })
            : buildBoundaryRenderer({
                rows,
                fields: names,
                aliases,
                requestedScheme: symScheme,
              });

        if (symLayerGroup === "chart") {
          // keyField must exist on the Chart layer — never force adm2_en if absent
          const schemaNames = layerSchema.map((f) => f.name);
          const resolveKey = (want: string): string => {
            const hit = schemaNames.find((n) => n.toLowerCase() === want.toLowerCase());
            return hit ?? "";
          };
          let keyField =
            resolveKey(levelMatch.nameField) ||
            resolveKey("unit") ||
            resolveKey("adm1_en") ||
            resolveKey("adm2_en") ||
            resolveKey("adm3_en") ||
            resolveKey("adm4_en") ||
            levelMatch.nameField;
          // Crime-only charts: prefer Unit
          if (hasCrime && !hasAdmin) {
            keyField = resolveKey("unit") || resolveKey("Unit") || keyField;
          }
          const valueFields = sizeName ? [...new Set([...names, sizeName])] : names;
          await map.applyJoinedChartRenderer({
            layer,
            rendererJson: built.renderer,
            rows,
            keyField,
            valueFields,
            sizeField: sizeName,
          });
        } else {
          // Boundary: apply renderer on the SERVICE layer — keep polygons visible
          const layerFieldInfos = map.schemaOf(layer);
          const valueFields = sizeName ? [...new Set([...names, sizeName])] : names;
          const keyOnLayer =
            layerFieldInfos.find(
              (f) => f.name.toLowerCase() === levelMatch.nameField.toLowerCase(),
            )?.name ?? levelMatch.nameField;
          const needsJoin = hasCrime || fieldsMissingOnLayer(
            layerFieldInfos.map((f) => ({ name: f.name })),
            valueFields,
          );
          const rendererJson = needsJoin
            ? materializeJoinedBoundaryRenderer({
                renderer: built.renderer,
                rows,
                keyField: keyOnLayer,
                valueFields,
              })
            : built.renderer;
          map.applyRenderer(layer, rendererJson);
          layer.visible = true;
        }

        lastLegend = built.legend;
      }

      set({
        applied: { ...get().applied, [symLayerGroup]: lastLegend },
        symApplying: false,
        toast: {
          kind: "success",
          message: lastLegend
            ? `${lastLegend.method} applied to ${symLayerGroup} layers.`
            : "Symbology applied.",
        },
      });
    } catch (err) {
      set({
        symApplying: false,
        toast: {
          kind: "danger",
          message: err instanceof Error ? err.message : "Symbology apply failed.",
        },
      });
    }
  },
  resetSymbology: (group) => {
    const map = getMapController();
    const target = group ?? get().symLayerGroup;
    if (map) map.resetRenderers(target);
    const applied = { ...get().applied, [target]: null };
    set({
      applied,
      symFieldsByGroup: { ...get().symFieldsByGroup, [target]: [] },
      toast: { kind: "info", message: `${target} symbology reset.` },
    });
    map?.syncLegendFilter?.(applied);
  },
  zoomToLevel: async (level) => {
    const map = getMapController();
    if (map && typeof (map as { zoomToLevel?: (l: AdminLevelId) => Promise<void> }).zoomToLevel === "function") {
      await (map as { zoomToLevel: (l: AdminLevelId) => Promise<void> }).zoomToLevel(level);
    }
  },
  zoomToName: async (name) => {
    const map = getMapController();
    if (map && typeof (map as { zoomToName?: (l: AdminLevelId, n: string) => Promise<void> }).zoomToName === "function") {
      await (map as { zoomToName: (l: AdminLevelId, n: string) => Promise<void> }).zoomToName(get().currentLevel(), name);
    }
  },
  clearRankingSelection: () => {
    getMapController()?.clearHighlight?.();
  },
  setMapSelection: (name, geometry, info = null) => {
    set({
      selectionName: name,
      selectionGeometry: geometry,
      selectionInfo: name ? info ?? null : null,
    });
    void get().refreshAnalytics();
  },
  clearMapSelection: () => {
    set({ selectionName: null, selectionGeometry: null, selectionInfo: null });
    getMapController()?.clearHighlight?.();
    void get().refreshAnalytics();
  },
  showToast: (toast) => set({ toast }),
}));

export { describeMethod };
