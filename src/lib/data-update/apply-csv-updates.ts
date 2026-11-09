/**
 * Web-map attribute update (Append / Append and Replace).
 *
 * Ported behaviour from WebMap_Layer_Data_Update.pyt:
 * - Join on adm1_en / adm2_en / adm3_en / adm4_en (case-insensitive)
 * - OID field taken from schema type oid / esriFieldTypeOID (never hard-coded OBJECTID)
 * - System / join keys never written
 * - Append = current + csv; Replace = csv value
 * - Geometry never touched
 * - Boundary + Chart updated by place-name join
 * - Optional *_S100 scale columns written when present in CSV and on layer
 *
 * Inside rule (default-on, no UI change):
 * When the CSV is applied at Union level (adm4_en), the same indicator values are
 * automatically dissolved (SUM) and written to parent levels:
 *   adm3_en → Upazila, adm2_en → District, adm1_en → Division
 * Parent names come from CSV columns when present, otherwise from matched Union
 * feature attributes. Same Append / Replace mode is used at every level.
 *
 * Important: never put "OBJECTID" in query outFields when the service field is
 * "objectid" — ArcGIS returns: Field name 'OBJECTID' does not exist.
 */

import type { AdminLevelId } from "@/config/layers";
import { getAdminLevel } from "@/config/layers";
import { labelForField } from "@/config/indicators";
import { resolveFieldName, type FieldInfo } from "@/lib/gis/fields";
import { getMapController, type EsriLayer } from "@/lib/gis/map-controller";
import { findHeader, parseNumber, type CsvTable } from "./csv";

export type UpdateMode = "append" | "append_replace";

export type ApplyCsvResult = {
  matched: number;
  updated: number;
  skipped: number;
  message: string;
};

const JOIN_KEYS = ["adm1_en", "adm2_en", "adm3_en", "adm4_en"] as const;

const SYSTEM_FIELDS = new Set([
  "objectid",
  "objectid_1",
  "fid",
  "oid",
  "globalid",
  "global_id",
  "shape",
  "shape_length",
  "shape_area",
  "created_user",
  "created_date",
  "last_edited_user",
  "last_edited_date",
]);

const PROTECTED = new Set<string>([...JOIN_KEYS, ...SYSTEM_FIELDS]);

/** Parent levels to dissolve into when writing Union CSV (order: finest → coarsest). */
const PARENT_LEVELS: AdminLevelId[] = ["upazila", "district", "division"];

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (typeof o.details === "string" && o.details.trim()) return o.details;
  }
  return fallback;
}

/** OID field name from schema type (same as Pro tool). Never invent OBJECTID. */
function oidFieldFromSchema(schema: FieldInfo[], layer?: EsriLayer): string {
  const byType = schema.find((f) => {
    const t = (f.type || "").toLowerCase();
    return t === "oid" || t === "esrifieldtypeoid" || t.includes("oid");
  });
  if (byType) return byType.name;

  for (const name of ["objectid", "OBJECTID", "ObjectId", "fid", "FID"]) {
    const hit = schema.find((f) => f.name === name);
    if (hit) return hit.name;
  }
  const lower = schema.find((f) => f.name.toLowerCase() === "objectid" || f.name.toLowerCase() === "fid");
  if (lower) return lower.name;

  const fromLayer = layer?.objectIdField;
  if (typeof fromLayer === "string" && fromLayer.trim()) {
    // Only trust layer.objectIdField if that name exists on the schema
    const exists = schema.some((f) => f.name === fromLayer.trim());
    if (exists) return fromLayer.trim();
    const caseHit = schema.find((f) => f.name.toLowerCase() === fromLayer.trim().toLowerCase());
    if (caseHit) return caseHit.name;
  }
  return "objectid";
}

function attrGet(attrs: Record<string, unknown>, fieldName: string): unknown {
  if (fieldName in attrs) return attrs[fieldName];
  const lowerMap = new Map(Object.keys(attrs).map((k) => [k.toLowerCase(), k]));
  const real = lowerMap.get(fieldName.toLowerCase());
  return real != null ? attrs[real] : undefined;
}

function addValues(current: unknown, csvVal: number): number {
  const c = Number(current);
  const existing = Number.isFinite(c) ? c : 0;
  return existing + csvVal;
}

type FieldMapEntry = {
  catalogId: string;
  serviceName: string;
  csvHeader: string;
};

function buildFieldMap(
  schema: FieldInfo[],
  fieldIds: string[],
  headers: string[],
): { fieldMap: FieldMapEntry[]; missingInLayer: string[]; missingInCsv: string[] } {
  const fieldMap: FieldMapEntry[] = [];
  const missingInLayer: string[] = [];
  const missingInCsv: string[] = [];
  const seenService = new Set<string>();

  for (const id of fieldIds) {
    const serviceName = resolveFieldName(schema, id);
    if (!serviceName) {
      missingInLayer.push(labelForField(id));
    } else if (!PROTECTED.has(serviceName.toLowerCase())) {
      const csvHeader = findHeader(headers, [
        id,
        serviceName,
        labelForField(id),
        id.replaceAll("_", " "),
      ]);
      if (!csvHeader) {
        missingInCsv.push(labelForField(id));
      } else if (!seenService.has(serviceName.toLowerCase())) {
        seenService.add(serviceName.toLowerCase());
        fieldMap.push({ catalogId: id, serviceName, csvHeader });
      }
    }

    const scaleId = `${id}_S100`;
    const scaleService = resolveFieldName(schema, scaleId);
    if (scaleService && !PROTECTED.has(scaleService.toLowerCase())) {
      const scaleHeader = findHeader(headers, [scaleId, scaleService, `${labelForField(id)} S100`]);
      if (scaleHeader && !seenService.has(scaleService.toLowerCase())) {
        seenService.add(scaleService.toLowerCase());
        fieldMap.push({ catalogId: scaleId, serviceName: scaleService, csvHeader: scaleHeader });
      }
    }
  }

  return { fieldMap, missingInLayer, missingInCsv };
}

async function buildUpdatesForLayer(options: {
  layer: EsriLayer;
  schema: FieldInfo[];
  nameField: string;
  oidField: string;
  fieldMap: FieldMapEntry[];
  csvByKey: Map<string, Record<string, string>>;
  mode: UpdateMode;
  map: NonNullable<ReturnType<typeof getMapController>>;
}): Promise<{ updates: Array<{ attributes: Record<string, unknown> }>; matched: number; skipped: number }> {
  const { layer, nameField, oidField, fieldMap, csvByKey, mode, map } = options;

  // Only request fields that exist on the service. Never add OBJECTID / FID aliases
  // that are not the real oid field — that triggers:
  //   Field name 'OBJECTID' does not exist. Did you mean 'objectid'?
  const outFields = Array.from(
    new Set([nameField, oidField, ...fieldMap.map((f) => f.serviceName)].filter(Boolean)),
  );

  const features = await map.queryAttributes(layer, {
    where: "1=1",
    outFields,
    returnGeometry: false,
    num: 50_000,
  });

  const updates: Array<{ attributes: Record<string, unknown> }> = [];
  let matched = 0;
  let skipped = 0;

  for (const feature of features) {
    const attrs = feature.attributes ?? {};
    const rawName = attrGet(attrs, nameField);
    const key = String(rawName ?? "")
      .trim()
      .toLowerCase();
    const csvRow = key ? csvByKey.get(key) : undefined;
    if (!csvRow) {
      skipped++;
      continue;
    }
    matched++;

    let objectId = attrGet(attrs, oidField);
    if (objectId == null) {
      for (const k of Object.keys(attrs)) {
        if (k.toLowerCase() === "objectid" || k.toLowerCase() === "fid") {
          objectId = attrs[k];
          break;
        }
      }
    }
    if (objectId == null) {
      skipped++;
      continue;
    }

    const next: Record<string, unknown> = { [oidField]: objectId };
    let changed = false;
    for (const { serviceName, csvHeader } of fieldMap) {
      const csvNum = parseNumber(csvRow[csvHeader] ?? "");
      if (csvNum == null) continue;
      const current = attrGet(attrs, serviceName);
      next[serviceName] = mode === "append" ? addValues(current, csvNum) : csvNum;
      changed = true;
    }
    if (changed) updates.push({ attributes: next });
  }

  return { updates, matched, skipped };
}

/**
 * Apply one admin level (Boundary + optional Chart) from a pre-built csvByKey map.
 * Used for both the primary level and dissolved parent levels.
 */
async function applyLevelFromCsvByKey(options: {
  levelId: AdminLevelId;
  fieldIds: string[];
  mode: UpdateMode;
  tableHeaders: string[];
  csvByKey: Map<string, Record<string, string>>;
  map: NonNullable<ReturnType<typeof getMapController>>;
}): Promise<{ matched: number; updated: number; skipped: number; errors: string[] }> {
  const { levelId, fieldIds, mode, tableHeaders, csvByKey, map } = options;
  const level = getAdminLevel(levelId);
  const boundary = map.findLayer(level.layerTitles.boundary);
  if (!boundary) {
    return {
      matched: 0,
      updated: 0,
      skipped: 0,
      errors: [`Layer "${level.layerTitles.boundary}" was not found in the web map.`],
    };
  }

  const schema = map.schemaOf(boundary);
  const oidField = oidFieldFromSchema(schema, boundary);
  try {
    (boundary as { objectIdField?: string }).objectIdField = oidField;
  } catch {
    /* ignore */
  }

  const nameField =
    resolveFieldName(schema, level.nameField) ??
    resolveFieldName(schema, level.codeField) ??
    level.nameField;

  const { fieldMap } = buildFieldMap(schema, fieldIds, tableHeaders);
  if (!fieldMap.length) {
    return {
      matched: 0,
      updated: 0,
      skipped: 0,
      errors: [`No matching indicator fields on ${level.label} layer.`],
    };
  }

  let boundaryResult;
  try {
    boundaryResult = await buildUpdatesForLayer({
      layer: boundary,
      schema,
      nameField,
      oidField,
      fieldMap,
      csvByKey,
      mode,
      map,
    });
  } catch (err) {
    return {
      matched: 0,
      updated: 0,
      skipped: 0,
      errors: [errorMessage(err, `Failed to query layer "${boundary.title}".`)],
    };
  }

  type Job = { layer: EsriLayer; updates: Array<{ attributes: Record<string, unknown> }> };
  const jobs: Job[] = [];
  if (boundaryResult.updates.length) {
    jobs.push({ layer: boundary, updates: boundaryResult.updates });
  }

  const chart = map.findLayer(level.layerTitles.chart);
  if (chart) {
    try {
      const chartSchema = map.schemaOf(chart);
      const chartOid = oidFieldFromSchema(chartSchema, chart);
      try {
        (chart as { objectIdField?: string }).objectIdField = chartOid;
      } catch {
        /* ignore */
      }
      const chartName =
        resolveFieldName(chartSchema, level.nameField) ??
        resolveFieldName(chartSchema, level.codeField) ??
        nameField;

      const chartFieldMap: FieldMapEntry[] = [];
      for (const entry of fieldMap) {
        const chartField =
          resolveFieldName(chartSchema, entry.serviceName) ??
          resolveFieldName(chartSchema, entry.catalogId);
        if (!chartField || PROTECTED.has(chartField.toLowerCase())) continue;
        chartFieldMap.push({ ...entry, serviceName: chartField });
      }

      if (chartFieldMap.length) {
        const chartResult = await buildUpdatesForLayer({
          layer: chart,
          schema: chartSchema,
          nameField: chartName,
          oidField: chartOid,
          fieldMap: chartFieldMap,
          csvByKey,
          mode,
          map,
        });
        if (chartResult.updates.length) {
          jobs.push({ layer: chart, updates: chartResult.updates });
        }
      }
    } catch {
      /* chart optional */
    }
  }

  let updated = 0;
  const layerErrors: string[] = [];

  for (const job of jobs) {
    try {
      const result = await map.applyEdits(job.layer, job.updates);
      updated = Math.max(updated, result.updated);
    } catch (err) {
      layerErrors.push(`${job.layer.title}: ${errorMessage(err, "edit failed")}`);
    }
  }

  try {
    for (const job of jobs) {
      (job.layer as { refresh?: () => void }).refresh?.();
    }
  } catch {
    /* optional */
  }

  return {
    matched: boundaryResult.matched,
    updated,
    skipped: boundaryResult.skipped,
    errors: layerErrors,
  };
}

/**
 * Build dissolved parent tables from Union-level CSV rows.
 * Prefers parent name columns in the CSV; falls back to Union feature attributes.
 * Numeric indicator fields are SUMmed.
 */
async function buildDissolvedParentMaps(options: {
  table: CsvTable;
  joinHeader: string;
  fieldMap: FieldMapEntry[];
  map: NonNullable<ReturnType<typeof getMapController>>;
  unionLevel: ReturnType<typeof getAdminLevel>;
}): Promise<{
  byLevel: Map<AdminLevelId, Map<string, Record<string, string>>>;
  parentsFromCsv: boolean;
}> {
  const { table, joinHeader, fieldMap, map, unionLevel } = options;

  const parentHeaders: Partial<Record<AdminLevelId, string | null>> = {
    upazila: findHeader(table.headers, ["adm3_en", "Upazila", "upazila"]),
    district: findHeader(table.headers, ["adm2_en", "District", "district"]),
    division: findHeader(table.headers, ["adm1_en", "Division", "division"]),
  };
  const parentsFromCsv = Boolean(
    parentHeaders.upazila || parentHeaders.district || parentHeaders.division,
  );

  // Aggregate maps: levelId → (lowered parent name → summed numeric row as strings)
  const byLevel = new Map<AdminLevelId, Map<string, Record<string, string>>>();
  for (const pid of PARENT_LEVELS) {
    byLevel.set(pid, new Map());
  }

  // If any parent column is missing from CSV, load Union features once for attribute lookup.
  let unionAttrsByKey: Map<string, Record<string, unknown>> | null = null;
  if (!parentsFromCsv || !parentHeaders.upazila || !parentHeaders.district || !parentHeaders.division) {
    const boundary = map.findLayer(unionLevel.layerTitles.boundary);
    if (boundary) {
      const schema = map.schemaOf(boundary);
      const nameField =
        resolveFieldName(schema, unionLevel.nameField) ??
        resolveFieldName(schema, unionLevel.codeField) ??
        unionLevel.nameField;
      const parentFields = ["adm1_en", "adm2_en", "adm3_en"]
        .map((f) => resolveFieldName(schema, f) ?? f)
        .filter(Boolean);
      const outFields = Array.from(new Set([nameField, ...parentFields]));
      try {
        const features = await map.queryAttributes(boundary, {
          where: "1=1",
          outFields,
          returnGeometry: false,
          num: 50_000,
        });
        unionAttrsByKey = new Map();
        for (const feature of features) {
          const attrs = feature.attributes ?? {};
          const key = String(attrGet(attrs, nameField) ?? "")
            .trim()
            .toLowerCase();
          if (key) unionAttrsByKey.set(key, attrs);
        }
      } catch {
        unionAttrsByKey = null;
      }
    }
  }

  const accumulate = (
    levelId: AdminLevelId,
    parentName: string,
    fieldValues: Record<string, number>,
  ) => {
    const key = parentName.trim().toLowerCase();
    if (!key) return;
    const mapForLevel = byLevel.get(levelId)!;
    let row = mapForLevel.get(key);
    if (!row) {
      // Seed with a synthetic join column so buildUpdatesForLayer can match on nameField
      const level = getAdminLevel(levelId);
      row = { [level.nameField]: parentName.trim() };
      // Also set common aliases so findHeader / join still works if nameField differs
      row["adm3_en"] = levelId === "upazila" ? parentName.trim() : row["adm3_en"] ?? "";
      row["adm2_en"] = levelId === "district" ? parentName.trim() : row["adm2_en"] ?? "";
      row["adm1_en"] = levelId === "division" ? parentName.trim() : row["adm1_en"] ?? "";
      mapForLevel.set(key, row);
    }
    for (const [header, num] of Object.entries(fieldValues)) {
      const prev = parseNumber(row[header] ?? "");
      row[header] = String((prev ?? 0) + num);
    }
  };

  for (const csvRow of table.rows) {
    const unionKey = String(csvRow[joinHeader] ?? "")
      .trim()
      .toLowerCase();
    if (!unionKey) continue;

    // Collect numeric values for this CSV row (only fields in fieldMap)
    const fieldValues: Record<string, number> = {};
    let hasAny = false;
    for (const { csvHeader } of fieldMap) {
      const n = parseNumber(csvRow[csvHeader] ?? "");
      if (n == null) continue;
      fieldValues[csvHeader] = n;
      hasAny = true;
    }
    if (!hasAny) continue;

    const layerAttrs = unionAttrsByKey?.get(unionKey);

    const resolveParent = (
      levelId: AdminLevelId,
      admField: string,
      csvHeader: string | null | undefined,
    ): string => {
      if (csvHeader) {
        const fromCsv = String(csvRow[csvHeader] ?? "").trim();
        if (fromCsv) return fromCsv;
      }
      if (layerAttrs) {
        const fromLayer = attrGet(layerAttrs, admField);
        if (fromLayer != null && String(fromLayer).trim()) return String(fromLayer).trim();
      }
      return "";
    };

    const upz = resolveParent("upazila", "adm3_en", parentHeaders.upazila);
    const dist = resolveParent("district", "adm2_en", parentHeaders.district);
    const div = resolveParent("division", "adm1_en", parentHeaders.division);

    if (upz) accumulate("upazila", upz, fieldValues);
    if (dist) accumulate("district", dist, fieldValues);
    if (div) accumulate("division", div, fieldValues);
  }

  return { byLevel, parentsFromCsv };
}

/**
 * Apply CSV attribute values to Boundary (+ Chart) layers for one admin level.
 * When level is Union, also dissolves and writes to Upazila / District / Division.
 */
export async function applyCsvUpdates(options: {
  levelId: AdminLevelId;
  fieldIds: string[];
  mode: UpdateMode;
  table: CsvTable;
}): Promise<ApplyCsvResult> {
  const { levelId, fieldIds, mode, table } = options;
  const map = getMapController();
  if (!map?.view) throw new Error("Map is not ready. Open the dashboard map first, then try again.");
  if (!fieldIds.length) throw new Error("Select at least one indicator field.");
  if (!table.rows.length) throw new Error("The CSV has no data rows.");

  const level = getAdminLevel(levelId);
  const boundary = map.findLayer(level.layerTitles.boundary);
  if (!boundary) throw new Error(`Layer "${level.layerTitles.boundary}" was not found in the web map.`);

  const schema = map.schemaOf(boundary);
  const oidField = oidFieldFromSchema(schema, boundary);

  try {
    (boundary as { objectIdField?: string }).objectIdField = oidField;
  } catch {
    /* ignore */
  }

  const nameField =
    resolveFieldName(schema, level.nameField) ??
    resolveFieldName(schema, level.codeField) ??
    level.nameField;

  const joinHeader =
    findHeader(table.headers, [
      level.nameField,
      level.codeField,
      nameField,
      ...JOIN_KEYS,
      "NAME",
      level.label,
      level.shortLabel,
      "Division",
      "District",
      "Upazila",
      "Union",
      "Ward",
    ]) ?? null;

  if (!joinHeader) {
    throw new Error(
      `CSV must include a join column for ${level.label} (e.g. ${level.nameField}). Found columns: ${table.headers.slice(0, 12).join(", ")}${table.headers.length > 12 ? "…" : ""}.`,
    );
  }

  const { fieldMap, missingInLayer, missingInCsv } = buildFieldMap(schema, fieldIds, table.headers);

  if (!fieldMap.length) {
    const parts: string[] = [];
    if (missingInLayer.length) parts.push(`not in layer: ${missingInLayer.join(", ")}`);
    if (missingInCsv.length) parts.push(`not in CSV: ${missingInCsv.join(", ")}`);
    throw new Error(
      `None of the selected fields were found in both the layer schema and the CSV headers${parts.length ? ` (${parts.join("; ")})` : ""}.`,
    );
  }

  const csvByKey = new Map<string, Record<string, string>>();
  for (const row of table.rows) {
    const key = String(row[joinHeader] ?? "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    csvByKey.set(key, row);
  }

  if (!csvByKey.size) {
    throw new Error("No valid join keys found in the CSV.");
  }

  // --- Primary level write (existing behaviour) ---
  const primary = await applyLevelFromCsvByKey({
    levelId,
    fieldIds,
    mode,
    tableHeaders: table.headers,
    csvByKey,
    map,
  });

  if (!primary.updated && primary.errors.length && levelId !== "union") {
    throw new Error(
      `Could not write edits. ${primary.errors.join(" · ")} Ensure the hosted feature layer allows Update, and that you are signed in to ArcGIS with edit privileges if required.`,
    );
  }

  const levelMessages: string[] = [];
  levelMessages.push(
    `${level.label}: matched ${primary.matched}, updated ${primary.updated}, skipped ${primary.skipped}`,
  );
  if (primary.errors.length) {
    levelMessages.push(`(${primary.errors.join("; ")})`);
  }

  // --- Silent dissolve to parent levels when writing Union ---
  if (levelId === "union") {
    try {
      const { byLevel } = await buildDissolvedParentMaps({
        table,
        joinHeader,
        fieldMap,
        map,
        unionLevel: level,
      });

      for (const parentId of PARENT_LEVELS) {
        const parentMap = byLevel.get(parentId);
        if (!parentMap || parentMap.size === 0) continue;

        // Synthetic headers: original CSV headers + parent name fields so buildFieldMap works
        const parentLevel = getAdminLevel(parentId);
        const syntheticHeaders = Array.from(
          new Set([
            ...table.headers,
            parentLevel.nameField,
            "adm1_en",
            "adm2_en",
            "adm3_en",
          ]),
        );

        const parentResult = await applyLevelFromCsvByKey({
          levelId: parentId,
          fieldIds,
          mode,
          tableHeaders: syntheticHeaders,
          csvByKey: parentMap,
          map,
        });

        levelMessages.push(
          `${parentLevel.label}: matched ${parentResult.matched}, updated ${parentResult.updated}, skipped ${parentResult.skipped}`,
        );
        if (parentResult.errors.length) {
          levelMessages.push(`(${parentResult.errors.join("; ")})`);
        }
      }
    } catch (err) {
      levelMessages.push(`Parent dissolve: ${errorMessage(err, "failed")}`);
    }
  }

  const totalUpdated = primary.updated;
  if (!totalUpdated && primary.errors.length && levelId === "union") {
    // Still report parent progress if any; only hard-fail when primary also failed with no writes
    const anyParentNote = levelMessages.some((m) => /Upazila|District|Division/.test(m) && /updated [1-9]/.test(m));
    if (!anyParentNote) {
      throw new Error(
        `Could not write edits. ${primary.errors.join(" · ")} Ensure the hosted feature layer allows Update, and that you are signed in to ArcGIS with edit privileges if required.`,
      );
    }
  }

  return {
    matched: primary.matched,
    updated: totalUpdated,
    skipped: primary.skipped,
    message: `Updated ${level.label} (${mode === "append" ? "Append" : "Append and Replace"}). ${levelMessages.join(" · ")}. OID field: ${oidField}.`,
  };
}
