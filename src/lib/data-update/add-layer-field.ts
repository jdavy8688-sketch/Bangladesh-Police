/**
 * Add a field to every Boundary + Chart feature layer in the web map
 * (Division → District → Upazila → Union) via ArcGIS REST addToDefinition.
 *
 * Requires the signed-in ArcGIS identity (or public service) to allow schema
 * changes on the hosted feature layer. Catalog registration is separate.
 */

import { ADMIN_LEVELS } from "@/config/layers";
import { getMapController, type EsriLayer } from "@/lib/gis/map-controller";

export type AddLayerFieldInput = {
  name: string;
  alias: string;
  /** UI type: Double | Integer | String | Date */
  type: string;
};

export type AddLayerFieldResult = {
  attempted: number;
  created: number;
  skipped: number;
  failed: string[];
  message: string;
};

const TYPE_MAP: Record<string, string> = {
  double: "esriFieldTypeDouble",
  integer: "esriFieldTypeInteger",
  string: "esriFieldTypeString",
  date: "esriFieldTypeDate",
};

function sanitizeFieldName(raw: string): string {
  let name = raw.trim().replace(/\s+/g, "_");
  name = name.replace(/[^A-Za-z0-9_]/g, "_");
  if (!/^[A-Za-z]/.test(name)) {
    name = `F_${name}`;
  }
  return name.slice(0, 64);
}

function fieldDefinition(name: string, alias: string, uiType: string) {
  const esriType = TYPE_MAP[uiType.trim().toLowerCase()] || "esriFieldTypeDouble";
  const def: Record<string, unknown> = {
    name,
    type: esriType,
    alias: alias || name,
    nullable: true,
    editable: true,
  };
  if (esriType === "esriFieldTypeString") {
    def.length = 255;
  }
  return def;
}

function layerHasField(layer: EsriLayer, name: string): boolean {
  const lower = name.toLowerCase();
  return (layer.fields ?? []).some(
    (f) => (f.name || "").toLowerCase() === lower || (f.alias || "").toLowerCase() === lower,
  );
}

/**
 * Resolve a FeatureServer layer endpoint suitable for admin ops.
 * Accepts .../FeatureServer/N or .../MapServer/N; strips trailing slash.
 */
function featureLayerAdminUrl(layer: EsriLayer): string {
  const raw = (layer.url || "").trim();
  if (!raw) {
    throw new Error(`Layer "${layer.title || "unknown"}" has no service URL.`);
  }

  // Prefer parsedUrl from the API when present (more reliable than string url)
  const parsed = (layer as { parsedUrl?: { path?: string; url?: string } }).parsedUrl;
  let base = (parsed?.path || parsed?.url || raw).replace(/\/+$/, "");

  // Some portal layers expose url without layer index — try layerId
  const layerId = (layer as { layerId?: number }).layerId;
  if (!/\/(FeatureServer|MapServer)\/\d+$/i.test(base) && typeof layerId === "number") {
    if (/\/(FeatureServer|MapServer)$/i.test(base)) {
      base = `${base}/${layerId}`;
    }
  }

  if (!/^https?:\/\//i.test(base)) {
    throw new Error(`Layer "${layer.title}" has an invalid service URL: ${base}`);
  }

  return base;
}

/**
 * Hosted schema ops (addToDefinition) require the *admin* REST path.
 * Public .../rest/services/.../FeatureServer/0/addToDefinition is treated as
 * object id "addToDefinition" → "Object id 'addToDefinition' is not valid".
 *
 * .../rest/services/... → .../rest/admin/services/...
 */
function toAdminFeatureLayerUrl(layerUrl: string): string {
  const base = layerUrl.replace(/\/+$/, "");
  if (/\/rest\/admin\/services\//i.test(base)) return base;
  if (/\/rest\/services\//i.test(base)) {
    return base.replace(/\/rest\/services\//i, "/rest/admin/services/");
  }
  // Fallback: insert /admin before /services/ if present
  if (/\/services\//i.test(base) && !/\/admin\//i.test(base)) {
    return base.replace(/\/services\//i, "/admin/services/");
  }
  return base;
}

/**
 * Resolve a token without opening a sign-in UI (that freezes the Manage Data modal).
 * Checks the service URL, admin URL, and portal URL credentials.
 */
async function resolveToken(serviceUrl: string): Promise<string | undefined> {
  try {
    const IdentityManager = (await import("@arcgis/core/identity/IdentityManager.js")).default as {
      findCredential?: (url: string) => { token?: string } | null | undefined;
      checkSignInStatus?: (url: string) => Promise<{ token?: string }>;
    };
    const cached = IdentityManager.findCredential?.(serviceUrl);
    if (cached?.token) return cached.token;
    try {
      const status = await IdentityManager.checkSignInStatus?.(serviceUrl);
      if (status?.token) return status.token;
    } catch {
      /* not signed in */
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const NO_TOKEN_HINT =
  "No ArcGIS token with schema privileges. On the portal, register an OAuth app, set oauthAppId in src/config/app-config.ts, reload, sign in as a user who owns/edits the hosted layers, then try again. Or add the field in Portal/Pro and only register it in the catalog here.";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function postAddToDefinition(layer: EsriLayer, fieldDef: Record<string, unknown>): Promise<void> {
  const publicUrl = featureLayerAdminUrl(layer);
  const base = toAdminFeatureLayerUrl(publicUrl);
  const endpoint = `${base}/addToDefinition`;

  const esriRequest = (await import("@arcgis/core/request.js")).default as (
    url: string,
    opts: unknown,
  ) => Promise<{
    data?: {
      success?: boolean;
      error?: { message?: string; details?: string[]; code?: number };
    };
  }>;

  // Token is usually registered against the public service URL or portal
  let token =
    (await resolveToken(publicUrl)) ||
    (await resolveToken(base));
  try {
    const { getAppConfig } = await import("@/config/app-config");
    const portalUrl = getAppConfig().portalUrl;
    if (!token && portalUrl) token = await resolveToken(portalUrl);
  } catch {
    /* optional */
  }

  if (!token) {
    throw new Error(NO_TOKEN_HINT);
  }

  // ArcGIS REST expects application/x-www-form-urlencoded body, not a JS object
  const params = new URLSearchParams();
  params.set("f", "json");
  params.set("addToDefinition", JSON.stringify({ fields: [fieldDef] }));
  params.set("token", token);

  // no-prompt: never open ArcGIS sign-in under the Manage Data modal (black backdrop + hang)
  const response = await withTimeout(
    esriRequest(endpoint, {
      method: "post",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      responseType: "json",
      authMode: "no-prompt",
    }),
    25_000,
    `addToDefinition (${layer.title || "layer"})`,
  );

  const data = response?.data;
  if (data?.error) {
    const detail =
      (Array.isArray(data.error.details) && data.error.details.length
        ? data.error.details.join(" ")
        : null) ||
      data.error.message ||
      "addToDefinition failed";
    throw new Error(detail);
  }
  if (data && data.success === false) {
    throw new Error(data.error?.message || "addToDefinition returned success=false");
  }
}

/**
 * Collect Boundary + Chart layers for every admin level (Division → Union).
 * Falls back to title heuristics when exact configured titles are missing.
 */

/*function collectTargetLayers(
  map: NonNullable<ReturnType<typeof getMapController>>,
): EsriLayer[] {
  const byUrl = new Map<string, EsriLayer>();

  const add = (layer: EsriLayer | null | undefined) => {
    if (!layer) return;
    const key = (layer.url || layer.title || "").toLowerCase();
    if (!key || byUrl.has(key)) return;
    byUrl.set(key, layer);
  };

  // Preferred: configured titles for each admin level
  for (const level of ADMIN_LEVELS) {
    add(map.findLayer(level.layerTitles.boundary));
    add(map.findLayer(level.layerTitles.chart));
  }

  // Fallback: any feature layer whose title looks like Boundary / Chart
  for (const layer of map.featureLayers()) {
    const t = (layer.title || "").toLowerCase();
    if (t.includes("boundary") || t.includes("chart")) {
      add(layer);
    }
  }

  return Array.from(byUrl.values());
}*/

/**
 * Collect every feature layer in the web map (Division–Union Boundary/Chart
 * and any other feature layers). Dedupe by title + url + layerId so layers
 * that share a base service URL are not collapsed into one target.
 */
function collectTargetLayers(
  map: NonNullable<ReturnType<typeof getMapController>>,
): EsriLayer[] {
  const byKey = new Map<string, EsriLayer>();

  const add = (layer: EsriLayer | null | undefined) => {
    if (!layer || layer.type !== "feature") return;
    const url = (layer.url || "").toLowerCase();
    const title = (layer.title || "").toLowerCase();
    const layerId = String((layer as { layerId?: number }).layerId ?? "");
    const key = `${title}|${url}|${layerId}`;
    if (!title && !url) return;
    if (byKey.has(key)) return;
    byKey.set(key, layer);
  };

  // All feature layers currently loaded in the web map
  for (const layer of map.featureLayers()) {
    add(layer);
  }

  // Also resolve by configured titles (covers title mismatches / groups)
  for (const level of ADMIN_LEVELS) {
    add(map.findLayer(level.layerTitles.boundary));
    add(map.findLayer(level.layerTitles.chart));
  }

  return Array.from(byKey.values());
}

/**
 * Create the attribute column on every Boundary and Chart layer in the web map.
 */
export async function addFieldToWebMapLayers(input: AddLayerFieldInput): Promise<AddLayerFieldResult> {
  const name = sanitizeFieldName(input.name);
  if (!name) {
    return {
      attempted: 0,
      created: 0,
      skipped: 0,
      failed: [],
      message: "Enter a valid field name (letters, numbers, underscore).",
    };
  }

  const map = getMapController();
  if (!map) {
    return {
      attempted: 0,
      created: 0,
      skipped: 0,
      failed: ["Map is not ready."],
      message: "Wait until the web map finishes loading, then try again.",
    };
  }

  const fieldDef = fieldDefinition(name, input.alias || name, input.type);
  const targets = collectTargetLayers(map);

  if (!targets.length) {
    return {
      attempted: 0,
      created: 0,
      skipped: 0,
      failed: ["No Boundary/Chart layers found in the web map."],
      message: "No feature layers were found to update (Division–Union Boundary/Chart).",
    };
  }

  let created = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const layer of targets) {
    const title = layer.title || layer.url || "layer";
    try {
      if (layerHasField(layer, name)) {
        skipped += 1;
        continue;
      }
      // Validate URL early for a clearer error
      featureLayerAdminUrl(layer);
      await postAddToDefinition(layer, fieldDef);
      created += 1;
      try {
        // Refresh only — do not await load() after schema change (can hang)
        (layer as { refresh?: () => void }).refresh?.();
      } catch {
        /* optional */
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push(`${title}: ${msg}`);
    }
  }

  const parts: string[] = [];
  if (created) parts.push(`created on ${created} layer(s)`);
  if (skipped) parts.push(`already present on ${skipped} layer(s)`);
  if (failed.length) parts.push(`failed on ${failed.length} layer(s)`);

  let message: string;
  if (created && !failed.length) {
    message = `Field "${name}" ${parts.join("; ")} (Division–Union Boundary/Chart). Reload the map if the column does not appear in symbology yet.`;
  } else if (created && failed.length) {
    message = `Field "${name}" partially applied (${parts.join("; ")}). ${failed[0]}`;
  } else if (!created && skipped && !failed.length) {
    message = `Field "${name}" already exists on the web map layers.`;
  } else if (failed.length) {
    message = `Could not create field on the feature service. ${failed[0]}`;
  } else {
    message = `No layers were updated for field "${name}".`;
  }

  return {
    attempted: targets.length,
    created,
    skipped,
    failed,
    message,
  };
}
