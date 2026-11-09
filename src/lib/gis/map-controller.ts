/**
 * ArcGIS Maps SDK controller.
 *
 * All @arcgis/core imports are dynamic so this module is safe to parse during
 * SSR. Call `createMapController` only in the browser.
 */

import { getAppConfig } from "@/config/app-config";
import {
  ADMIN_LEVELS,
  type AdminLevel,
  type AdminLevelId,
  type LayerGroupId,
  type LocationFilters,
  scaleToLevel,
} from "@/config/layers";
import { toFieldInfoFromEsri, type FieldInfo } from "@/lib/gis/fields";
import { whereForLevel } from "@/lib/gis/where";
import type { AppliedLegend, EsriRenderer } from "@/lib/symbology/renderers";

type EsriModules = {
  esriConfig: { portalUrl: string; assetsPath: string; request: { timeout: number } };
  WebMap: new (props: unknown) => EsriWebMap;
  MapView: new (props: unknown) => EsriMapView;
  Zoom: new (props: unknown) => { destroy: () => void };
  Home: new (props: unknown) => { destroy: () => void };
  Expand: new (props: unknown) => { content: unknown; destroy: () => void };
  Legend: new (props: unknown) => {
    destroy: () => void;
    layerInfos?: Array<{ layer: unknown }>;
  };
  BasemapGallery: new (props: unknown) => { destroy: () => void };
  LayerList: new (props: unknown) => { destroy: () => void };
  ScaleBar: new (props: unknown) => { destroy: () => void };
  PopupTemplate: new (props: unknown) => unknown;
  jsonUtils: { fromJSON: (json: unknown) => unknown };
};

type EsriWebMap = {
  portalItem?: { title?: string };
  basemap?: unknown;
  load: () => Promise<unknown>;
  allLayers: { toArray: () => EsriLayer[] };
  layers: { toArray: () => EsriLayer[] };
  /** Standalone hosted tables (CSV / table items) — not in allLayers. */
  tables?: { toArray: () => EsriLayer[] };
  destroy?: () => void;
};

export type EsriLayer = {
  id: string;
  title: string;
  type: string;
  visible: boolean;
  opacity: number;
  minScale: number;
  maxScale: number;
  objectIdField?: string;
  globalIdField?: string;
  definitionExpression?: string;
  renderer?: unknown;
  fields?: Array<{ name: string; alias?: string; type: string }>;
  outFields?: string[] | string;
  popupTemplate?: unknown;
  popupEnabled?: boolean;
  queryFeatures: (query: Record<string, unknown>) => Promise<{
    features: EsriFeature[];
    exceededTransferLimit?: boolean;
  }>;
  queryExtent: (query: Record<string, unknown>) => Promise<{ extent: unknown; count: number }>;
  queryFeatureCount: (query: Record<string, unknown>) => Promise<number>;
  createQuery?: () => Record<string, unknown>;
  url?: string;
  load?: () => Promise<unknown>;
  loaded?: boolean;
  listMode?: string;
  isTable?: boolean;
  parent?: { visible?: boolean; type?: string };
  applyEdits?: (edits: {
    updateFeatures?: Array<{ attributes: Record<string, unknown> }>;
  }) => Promise<{ updateFeatureResults?: Array<{ objectId?: number; error?: unknown }> }>;
};

export type EsriFeature = {
  attributes: Record<string, unknown>;
  geometry?: unknown;
};

type EsriMapView = {
  container: HTMLDivElement | string | null;
  map: EsriWebMap;
  scale: number;
  ready: boolean;
  padding: { left: number; right: number; top: number; bottom: number };
  popup: {
    autoOpenEnabled: boolean;
    dockEnabled: boolean;
    dockOptions: unknown;
    defaultPopupTemplateEnabled?: boolean;
    visible?: boolean;
  };
  ui: {
    add: (w: unknown, pos?: string) => void;
    remove: (w: unknown) => void;
    empty: (pos?: string) => void;
    components: string[];
    padding: { left: number; right: number; top: number; bottom: number };
  };
  when: () => Promise<void>;
  goTo: (target: unknown, opts?: unknown) => Promise<unknown>;
  watch: (prop: string, cb: (v: unknown) => void) => { remove: () => void };
  whenLayerView: (layer: EsriLayer) => Promise<{ highlight: (id: unknown) => { remove: () => void } }>;
  hitTest: (e: unknown) => Promise<{ results: Array<{ graphic?: EsriFeature; layer?: EsriLayer }> }>;
  on: (event: string, cb: (e: unknown) => void) => { remove: () => void };
  destroy: () => void;
  viewpoint: { clone: () => unknown };
  extent: unknown;
  animation?: unknown;
};

export type MapFeatureSelectPayload = {
  name: string;
  geometry: unknown;
  info: {
    unitLabel: string;
    areaName: string;
    ancestors: Array<{ label: string; value: string }>;
  };
};

export type MapEvents = {
  onReady?: () => void;
  onScale?: (level: AdminLevelId, scale: number) => void;
  onExtentSettled?: () => void;
  onError?: (message: string) => void;
  onOpenLeftPanel?: () => void;
  onOpenRightPanel?: () => void;
  /** Fired when the user clicks a boundary polygon on the map. */
  onFeatureSelect?: (payload: MapFeatureSelectPayload | null) => void;
};

function isChartLayer(layer: EsriLayer): boolean {
  return /chart/i.test(layer.title || "");
}

async function loadEsri(): Promise<EsriModules> {
  const [
    configMod,
    webmapMod,
    viewMod,
    zoomMod,
    homeMod,
    expandMod,
    legendMod,
    basemapGalleryMod,
    layerListMod,
    scaleMod,
    popupTemplateMod,
    jsonMod,
  ] = await Promise.all([
    import("@arcgis/core/config.js"),
    import("@arcgis/core/WebMap.js"),
    import("@arcgis/core/views/MapView.js"),
    import("@arcgis/core/widgets/Zoom.js"),
    import("@arcgis/core/widgets/Home.js"),
    import("@arcgis/core/widgets/Expand.js"),
    import("@arcgis/core/widgets/Legend.js"),
    import("@arcgis/core/widgets/BasemapGallery.js"),
    import("@arcgis/core/widgets/LayerList.js"),
    import("@arcgis/core/widgets/ScaleBar.js"),
    import("@arcgis/core/PopupTemplate.js"),
    import("@arcgis/core/renderers/support/jsonUtils.js"),
  ]);
  return {
    esriConfig: configMod.default as EsriModules["esriConfig"],
    WebMap: webmapMod.default as unknown as EsriModules["WebMap"],
    MapView: viewMod.default as unknown as EsriModules["MapView"],
    Zoom: zoomMod.default as unknown as EsriModules["Zoom"],
    Home: homeMod.default as unknown as EsriModules["Home"],
    Expand: expandMod.default as unknown as EsriModules["Expand"],
    Legend: legendMod.default as unknown as EsriModules["Legend"],
    BasemapGallery: basemapGalleryMod.default as unknown as EsriModules["BasemapGallery"],
    LayerList: layerListMod.default as unknown as EsriModules["LayerList"],
    ScaleBar: scaleMod.default as unknown as EsriModules["ScaleBar"],
    PopupTemplate: popupTemplateMod.default as unknown as EsriModules["PopupTemplate"],
    jsonUtils: jsonMod as EsriModules["jsonUtils"],
  };
}

export class MapController {
  view: EsriMapView | null = null;
  webmap: EsriWebMap | null = null;
  legendHost: HTMLDivElement | null = null;
  private esriLegendHost: HTMLElement | null = null;
  private esriLegend: {
    destroy: () => void;
    layerInfos?: Array<{ layer: unknown }>;
  } | null = null;
  private legendExpand: { content: unknown; destroy: () => void } | null = null;
  private modules: EsriModules | null = null;
  private originalRenderers = new Map<string, unknown>();
  private originalPopupTemplates = new Map<string, unknown>();

  private chartCalloutLayer: {
    removeAll: () => void;
    addMany: (g: unknown[]) => void;
    visible: boolean;
  } | null = null;

  /** Client-side FeatureLayers with joined indicator attrs for pie charts. */
  private joinedChartLayers = new Map<
    string,
    { layer: EsriLayer; originalId: string; originalVisible: boolean }
  >();

  /**
   * Cached centroids (one point per admin unit) for fast chart layer builds.
   * Keyed by source layer id → normalized admin name → { geometry, attrs, name }.
   * Built once per layer; reused on every subsequent chart apply.
   */
  private centroidCache = new Map<
    string,
    Map<string, { geometry: unknown; attrs: Record<string, unknown>; name: string }>
  >();

  private initialViewpoint: unknown = null;
  private handles: Array<{ remove: () => void }> = [];
  private highlightHandle: { remove: () => void } | null = null;
  private widgets: Array<{ destroy: () => void }> = [];
  private filterToggleBtn: HTMLButtonElement | null = null;
  private symbologyToggleBtn: HTMLButtonElement | null = null;
  private clearSelectionBtn: HTMLButtonElement | null = null;
  private onOpenLeft: (() => void) | null = null;
  private onOpenRight: (() => void) | null = null;
  private onClearSelection: (() => void) | null = null;
  private extentOverride: unknown | null = null;

  async init(container: HTMLDivElement, events: MapEvents = {}): Promise<void> {
    const config = getAppConfig();
    const modules = await loadEsri();
    this.modules = modules;

    modules.esriConfig.portalUrl = config.portalUrl;
    modules.esriConfig.assetsPath = `https://js.arcgis.com/${config.arcgisVersion}/@arcgis/core/assets`;
    modules.esriConfig.request.timeout = 90_000;

    if (config.oauthAppId && config.oauthAppId !== "YOUR_ENTERPRISE_APP_ID") {
      const [IdentityManagerMod, OAuthInfoMod] = await Promise.all([
        import("@arcgis/core/identity/IdentityManager.js"),
        import("@arcgis/core/identity/OAuthInfo.js"),
      ]);
      const IdentityManager = IdentityManagerMod.default as {
        registerOAuthInfos: (i: unknown[]) => void;
        checkSignInStatus: (url: string) => Promise<{ token?: string }>;
        getCredential: (url: string) => Promise<{ token?: string }>;
      };
      const OAuthInfo = OAuthInfoMod.default as new (p: unknown) => unknown;

      IdentityManager.registerOAuthInfos([
        new OAuthInfo({
          appId: config.oauthAppId,
          portalUrl: config.portalUrl,
          popup: false,
        }),
      ]);

      try {
        await IdentityManager.checkSignInStatus(config.portalUrl);
      } catch {
        await IdentityManager.getCredential(config.portalUrl);
      }
    }

    const webmap = new modules.WebMap({
      portalItem: { id: config.webmapId, portal: { url: config.portalUrl } },
    });

    const view = new modules.MapView({
      container,
      map: webmap,
      constraints: { snapToZoom: false },
      ui: { components: ["attribution"] },
      popup: {
        autoOpenEnabled: true,
        defaultPopupTemplateEnabled: true,
        dockEnabled: false,
      },
    });

    try {
      if (view.popup) {
        view.popup.autoOpenEnabled = true;
        view.popup.dockEnabled = false;
        view.popup.defaultPopupTemplateEnabled = true;
      }
    } catch {
      /* popup chrome is optional */
    }

    this.webmap = webmap;
    this.view = view;

    try {
      await view.when();
    } catch (err) {
      const message = err instanceof Error ? err.message : "The web map failed to load.";
      events.onError?.(message);
      throw err;
    }

    this.initialViewpoint = view.viewpoint.clone();

    const legendRoot = document.createElement("div");
    legendRoot.className = "map-legend-root";

    const customHost = document.createElement("div");
    customHost.className = "custom-smart-legend";
    this.legendHost = customHost;

    const esriHost = document.createElement("div");
    esriHost.className = "esri-smart-legend-host";
    this.esriLegendHost = esriHost;

    legendRoot.append(customHost, esriHost);

    const esriLegend = new modules.Legend({
      view,
      container: esriHost,
      hideLayersNotInCurrentView: true,
    });
    this.esriLegend = esriLegend;

    const zoom = new modules.Zoom({ view, layout: "horizontal" });
    const home = new modules.Home({ view });

    this.legendExpand = null;

    const basemapGallery = new modules.BasemapGallery({ view });
    const basemapExpand = new modules.Expand({
      view,
      content: basemapGallery,
      expandIcon: "basemap",
      expandTooltip: "Basemap",
      group: "top-left-tools",
      mode: "floating",
    });
    const layerList = new modules.LayerList({ view });
    const layerListExpand = new modules.Expand({
      view,
      content: layerList,
      expandIcon: "layers",
      expandTooltip: "Layers",
      group: "top-left-tools",
      mode: "floating",
    });
    const scaleBar = new modules.ScaleBar({ view, unit: "metric", style: "ruler" });

    view.ui.add(home, "top-left");
    view.ui.add(basemapExpand, "top-left");
    view.ui.add(layerListExpand, "top-left");
    view.ui.add(zoom, "bottom-left");
    view.ui.add(scaleBar, "bottom-right");

    // Clear selection — icon-only, same Esri widget style as Basemap, directly below it
    this.clearSelectionBtn = document.createElement("button");
    this.clearSelectionBtn.type = "button";
    this.clearSelectionBtn.className = "esri-widget esri-widget--button";
    this.clearSelectionBtn.title = "Clear selection";
    this.clearSelectionBtn.setAttribute("aria-label", "Clear selection");
    this.clearSelectionBtn.innerHTML = `<calcite-icon icon="reset" scale="m"></calcite-icon>`;
    this.clearSelectionBtn.addEventListener("click", () => this.onClearSelection?.());
    this.clearSelectionBtn.style.display = "none";
    view.ui.add(this.clearSelectionBtn, "top-left");

    this.onOpenLeft = events.onOpenLeftPanel ?? null;
    this.onOpenRight = events.onOpenRightPanel ?? null;

    this.filterToggleBtn = this.createPanelToggleButton({
      title: "Smart Symbology",
      icon: "classify-pixels",
      onClick: () => this.onOpenLeft?.(),
    });
    this.symbologyToggleBtn = this.createPanelToggleButton({
      title: "Legends",
      icon: "legend",
      onClick: () => this.onOpenRight?.(),
    });
    view.ui.add(this.filterToggleBtn, "top-left");
    view.ui.add(this.symbologyToggleBtn, "top-right");
    this.filterToggleBtn.style.display = "none";
    this.symbologyToggleBtn.style.display = "none";

    this.widgets.push(
      zoom,
      home,
      esriLegend,
      basemapGallery,
      basemapExpand,
      layerList,
      layerListExpand,
      scaleBar,
    );

    // Ensure Boundary/Chart feature layers are listable + queryable (web map may hide children)
    for (const layer of this.allDataLayers()) {
      try {
        const anyLayer = layer as EsriLayer & { listMode?: string; isTable?: boolean };
        // Show geometry layers in the LayerList (groups still nest them)
        if (/boundary|chart/i.test(layer.title || "")) {
          anyLayer.listMode = "show";
        }
        // Keep hosted tables out of the operational layer list noise
        if (anyLayer.isTable || /csv|crime_data/i.test(layer.title || "")) {
          anyLayer.listMode = anyLayer.listMode || "hide";
        }
      } catch {
        /* listMode optional */
      }
    }

    for (const layer of this.featureLayers()) {
      this.originalRenderers.set(layer.id, layer.renderer);
      this.originalPopupTemplates.set(layer.id, layer.popupTemplate ?? null);

      // Ensure group parents are visible so children can draw
      try {
        const parent = (layer as EsriLayer & { parent?: { visible?: boolean; type?: string } }).parent;
        if (parent && parent.type === "group") parent.visible = true;
      } catch {
        /* parent optional */
      }

      try {
        layer.outFields = ["*"];
      } catch {
        /* ignore */
      }

      if (isChartLayer(layer)) {
        layer.popupEnabled = false;
        continue;
      }

      layer.popupEnabled = true;
      layer.visible = true;
      if (layer.definitionExpression === "1=0") {
        layer.definitionExpression = "1=1";
      }
    }

    this.handles.push(
      view.watch("scale", () => {
        if (!this.view) return;
        events.onScale?.(scaleToLevel(this.view.scale), this.view.scale);
      }),
    );

    this.handles.push(
      view.watch("stationary", (stationary) => {
        if (!this.view || !stationary) return;
        events.onScale?.(scaleToLevel(this.view.scale), this.view.scale);
        events.onExtentSettled?.();
      }),
    );

    events.onScale?.(scaleToLevel(view.scale), view.scale);

    this.handles.push(
      view.on("click", (event) => {
        void this.handleMapClick(event, events);
      }),
    );

    events.onReady?.();
  }

  private createPanelToggleButton(opts: {
    title: string;
    icon: string;
    onClick: () => void;
  }): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "esri-widget esri-widget--button map-panel-toggle-btn";
    btn.title = opts.title;
    btn.setAttribute("aria-label", opts.title);
    btn.innerHTML = `<calcite-icon icon="${opts.icon}" scale="s"></calcite-icon>`;
    btn.addEventListener("click", () => opts.onClick());
    return btn;
  }

  syncLegendFilter(applied: { boundary: AppliedLegend | null; chart: AppliedLegend | null }): void {
    if (!this.esriLegend) return;

    const bothApplied = Boolean(applied.boundary && applied.chart);
    if (bothApplied) {
      this.esriLegend.layerInfos = [];
      if (this.esriLegendHost) this.esriLegendHost.style.display = "none";
      return;
    }

    const layers = this.featureLayers().filter((layer) => {
      const isChart = isChartLayer(layer);
      if (isChart && applied.chart) return false;
      if (!isChart && applied.boundary) return false;
      return true;
    });

    this.esriLegend.layerInfos = layers.map((layer) => ({ layer }));
    if (this.esriLegendHost) {
      this.esriLegendHost.style.display = layers.length ? "" : "none";
    }
  }

  featureLayers(): EsriLayer[] {
    if (!this.webmap) return [];
    return this.webmap.allLayers.toArray().filter((layer) => layer.type === "feature");
  }

  /** Geometry feature layers + standalone tables (hosted CSV tables live here). */
  allDataLayers(): EsriLayer[] {
    if (!this.webmap) return [];
    const byId = new Map<string, EsriLayer>();
    const accept = (layer: EsriLayer) => {
      const t = String(layer.type || "").toLowerCase();
      // feature / table / csv / subtype-group tables used as hosted tables
      if (t === "feature" || t === "table" || t === "csv" || t === "subtype-group") return true;
      // any layer that can be queried (covers enterprise table variants)
      if (typeof layer.queryFeatures === "function") return true;
      return false;
    };
    for (const layer of this.webmap.allLayers.toArray()) {
      if (accept(layer)) {
        byId.set(layer.id || layer.title || String(byId.size), layer);
      }
    }
    try {
      const tables = this.webmap.tables?.toArray?.() ?? [];
      for (const layer of tables) {
        byId.set(layer.id || layer.title || String(byId.size), layer);
      }
    } catch {
      /* tables collection optional */
    }
    return Array.from(byId.values());
  }

  findLayer(title: string): EsriLayer | null {
    const wanted = title.trim().toLowerCase();
    const norm = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .replace(/\.csv$/i, "")
        .replace(/[\s_\-]+/g, "");
    const wantedNorm = norm(wanted);
    const layers = this.allDataLayers();
    const exact = layers.find((layer) => (layer.title || "").trim().toLowerCase() === wanted);
    if (exact) return exact;
    // with/without .csv
    const alt = wanted.endsWith(".csv") ? wanted.slice(0, -4) : `${wanted}.csv`;
    const altHit = layers.find((layer) => (layer.title || "").trim().toLowerCase() === alt);
    if (altHit) return altHit;
    const byNorm = layers.find((layer) => norm(layer.title || "") === wantedNorm);
    if (byNorm) return byNorm;
    // Soft match only for tables (csv / crime / data) — never for Boundary/Chart titles
    const isTableLookup = /csv|table|crime|data/i.test(wanted);
    if (isTableLookup) {
      const soft = layers.find((layer) => {
        const t = (layer.title || "").trim().toLowerCase();
        if (/\b(boundary|chart)\b/i.test(t)) return false;
        return t.includes(wanted) || wanted.includes(t) || norm(t).includes(wantedNorm);
      });
      if (soft) return soft;
    }
    return null;
  }

  layersFor(group: LayerGroupId, levelId: AdminLevelId | "all"): EsriLayer[] {
    const levels = levelId === "all" ? ADMIN_LEVELS : ADMIN_LEVELS.filter((l) => l.id === levelId);
    const found: EsriLayer[] = [];
    for (const level of levels) {
      const layer = this.findLayer(level.layerTitles[group]);
      if (layer) found.push(layer);
    }
    return found;
  }

  schemaOf(layer: EsriLayer): FieldInfo[] {
    return toFieldInfoFromEsri(layer.fields ?? []);
  }

  /**
   * Apply admin + Unit filters to all boundary/chart layers.
   * Unit is applied when the layer has a Unit field; otherwise names matching
   * that Unit are loaded from the hosted admin table and used in an IN clause.
   */
  async applyFilters(filters: LocationFilters, unit?: string | null): Promise<void> {
    const unitTrim = unit?.trim() || null;
    // Deepest selected admin filter (union > upazila > district > division).
    // Coarser boundary/chart layers are hidden so e.g. selecting a Union does not
    // leave the full Upazila polygon visible underneath.
    const levelOrder = ADMIN_LEVELS.map((l) => l.id);
    const deepestIdx = [...levelOrder]
      .map((id, i) => (filters[id] ? i : -1))
      .filter((i) => i >= 0)
      .reduce((a, b) => Math.max(a, b), -1);

    // Pre-load name lists per level when Unit is set but may not exist on geometry.
    const namesByLevel = new Map<string, string[]>();
    if (unitTrim) {
      for (const level of ADMIN_LEVELS) {
        try {
          const names = await this.namesForUnitOnLevel(level, unitTrim, filters);
          if (names.length) namesByLevel.set(level.id, names);
        } catch {
          /* table optional */
        }
      }
    }

    for (let li = 0; li < ADMIN_LEVELS.length; li++) {
      const level = ADMIN_LEVELS[li]!;
      // Hide coarser levels when a finer filter is active (e.g. hide Upazila when Union is set).
      const hideCoarser = deepestIdx >= 0 && li < deepestIdx;

      for (const group of ["boundary", "chart"] as LayerGroupId[]) {
        const layer = this.findLayer(level.layerTitles[group]);
        if (!layer) continue;

        let expression: string;
        if (hideCoarser) {
          expression = "1=0";
        } else {
          const schema = this.schemaOf(layer);
          const fieldNames = schema.map((f) => f.name);
          const hasUnit = schema.some((f) => f.name.toLowerCase() === "unit");
          // Only use adm* fields that exist on THIS layer (Chart layers may lack some)
          expression = whereForLevel(level, filters, fieldNames) || "1=1";
          if (unitTrim && hasUnit) {
            const unitField =
              schema.find((f) => f.name.toLowerCase() === "unit")?.name ?? "unit";
            const unitClause = `${unitField} = '${unitTrim.replaceAll("'", "''")}'`;
            expression =
              expression && expression !== "1=1"
                ? `(${expression}) AND (${unitClause})`
                : unitClause;
          } else if (unitTrim && !hasUnit) {
            const names = namesByLevel.get(level.id) ?? [];
            const nameFieldOnLayer =
              schema.find((f) => f.name.toLowerCase() === level.nameField.toLowerCase())?.name ??
              null;
            if (names.length && nameFieldOnLayer) {
              const inList = names
                .map((n) => `'${n.replaceAll("'", "''")}'`)
                .join(",");
              const nameClause = `${nameFieldOnLayer} IN (${inList})`;
              expression =
                expression && expression !== "1=1"
                  ? `(${expression}) AND (${nameClause})`
                  : nameClause;
            }
          }
          if (!expression) expression = "1=1";
        }

        layer.definitionExpression = expression;
        try {
          (layer as { refresh?: () => void }).refresh?.();
        } catch {
          /* optional */
        }

        // Client-side joined chart layers must follow the same filter
        const joined = this.joinedChartLayers.get(layer.id);
        if (joined?.layer) {
          const jl = joined.layer as EsriLayer & {
            definitionExpression?: string;
            refresh?: () => void;
          };
          jl.definitionExpression = expression;
          try {
            jl.refresh?.();
          } catch {
            /* optional */
          }
          // Hide joined chart when parent chart is hidden (coarser level)
          if (hideCoarser) {
            jl.visible = false;
          } else {
            jl.visible = true;
          }
        }
      }
    }
    await this.zoomToFilters(filters, unitTrim);
  }

  /**
   * Admin feature names at a level that belong to the given Unit.
   * Prefers geometry boundary layer attributes (Unit / Custom_Unit_Code on layer);
   * falls back to optional hosted admin table when present.
   */
  private async namesForUnitOnLevel(
    level: (typeof ADMIN_LEVELS)[number],
    unit: string,
    filters: LocationFilters,
  ): Promise<string[]> {
    const unitEsc = unit.replaceAll("'", "''");
    const clauses = [`Unit = '${unitEsc}'`];
    if (filters.division && level.id !== "division") {
      clauses.push(`adm1_en = '${filters.division.replaceAll("'", "''")}'`);
    }
    if (filters.district && (level.id === "upazila" || level.id === "union")) {
      clauses.push(`adm2_en = '${filters.district.replaceAll("'", "''")}'`);
    }
    if (filters.upazila && level.id === "union") {
      clauses.push(`adm3_en = '${filters.upazila.replaceAll("'", "''")}'`);
    }
    const where = clauses.join(" AND ");

    const collect = async (source: EsriLayer | null): Promise<string[]> => {
      if (!source) return [];
      try {
        const features = await this.queryAttributes(source, {
          where,
          outFields: ["*"],
          returnGeometry: false,
          returnDistinctValues: true,
          ignoreDefinitionExpression: true,
          num: 5000,
        });
        const names = new Set<string>();
        for (const f of features) {
          const v = f.attributes?.[level.nameField];
          if (v != null && String(v).trim()) names.add(String(v).trim());
        }
        return Array.from(names);
      } catch {
        return [];
      }
    };

    // Prefer boundary layer (indicators + Unit live on geometry in the new web map)
    const fromBoundary = await collect(this.findLayer(level.layerTitles.boundary));
    if (fromBoundary.length) return fromBoundary;

    // Legacy optional hosted admin table
    return collect(this.findLayer(level.tableTitle));
  }

  async applyEdits(
    layer: EsriLayer,
    updates: Array<{ attributes: Record<string, unknown> }>,
  ): Promise<{ updated: number }> {
    if (!updates.length) return { updated: 0 };

    const oidField = this.resolveObjectIdFieldName(layer);

    const normalized = updates.map((u) => {
      const attrs = { ...(u.attributes ?? {}) };
      let oid: unknown = undefined;
      for (const key of Object.keys(attrs)) {
        if (key.toLowerCase() === "objectid" || key.toLowerCase() === "fid" || key.toLowerCase() === "oid") {
          oid = attrs[key];
          delete attrs[key];
        }
      }
      if (oid == null && oidField && attrs[oidField] != null) {
        oid = attrs[oidField];
      }
      if (oid != null && oidField) {
        attrs[oidField] = oid;
      }
      for (const key of Object.keys(attrs)) {
        if (
          key !== oidField &&
          (key.toLowerCase() === "objectid" || key.toLowerCase() === "fid" || key.toLowerCase() === "oid")
        ) {
          delete attrs[key];
        }
      }
      return { attributes: attrs };
    });

    // REST applyEdits — exact field names (avoids JS API OBJECTID rewrite).
    const layerUrl = typeof layer.url === "string" ? layer.url.replace(/\/$/, "") : "";
    if (layerUrl && /\/FeatureServer\/\d+$/i.test(layerUrl)) {
      return this.applyEditsRest(layer, layerUrl, oidField, normalized);
    }

    if (typeof layer.applyEdits !== "function") {
      throw new Error(
        `Layer "${layer.title}" does not support applyEdits. Confirm the feature service allows updates.`,
      );
    }
    try {
      (layer as { objectIdField?: string }).objectIdField = oidField;
    } catch {
      /* ignore */
    }
    const result = await layer.applyEdits({ updateFeatures: normalized });
    const rows = result?.updateFeatureResults ?? [];
    const failed = rows.filter((r) => r.error);
    if (failed.length === rows.length && rows.length > 0) {
      const first = failed[0]?.error;
      let detail = "";
      if (first && typeof first === "object") {
        const e = first as Record<string, unknown>;
        detail = String(e.message ?? e.description ?? e.details ?? "").trim();
      } else if (typeof first === "string") {
        detail = first.trim();
      }
      throw new Error(
        detail
          ? `Edit failed on "${layer.title}": ${detail}`
          : `All ${failed.length} edit(s) failed on "${layer.title}". Sign in to ArcGIS with edit rights, or enable editing on the service.`,
      );
    }
    return { updated: rows.filter((r) => !r.error).length || updates.length };
  }

  /** REST applyEdits — same path as Pro toolbox fl.edit_features. */
  private async applyEditsRest(
    layer: EsriLayer,
    layerUrl: string,
    oidField: string,
    normalized: Array<{ attributes: Record<string, unknown> }>,
  ): Promise<{ updated: number }> {
    let token = "";
    try {
      const IdentityManager = await import("@arcgis/core/identity/IdentityManager.js");
      const im = (
        IdentityManager as {
          default: {
            findCredential?: (url: string) => { token?: string } | null;
            checkSignInStatus?: (url: string) => Promise<{ token?: string }>;
          };
        }
      ).default;
      const cred = im.findCredential?.(layerUrl) ?? null;
      if (cred?.token) {
        token = cred.token;
      } else if (typeof im.checkSignInStatus === "function") {
        try {
          const signed = await im.checkSignInStatus(layerUrl);
          if (signed?.token) token = signed.token;
        } catch {
          /* anonymous */
        }
      }
    } catch {
      /* identity optional */
    }

    const BATCH = 250;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < normalized.length; i += BATCH) {
      const batch = normalized.slice(i, i + BATCH);
      const body = new URLSearchParams();
      body.set("f", "json");
      body.set("rollbackOnFailure", "false");
      body.set("updates", JSON.stringify(batch.map((u) => ({ attributes: u.attributes }))));
      if (token) body.set("token", token);

      const res = await fetch(`${layerUrl}/applyEdits`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      let json: {
        updateResults?: Array<{
          success?: boolean;
          objectId?: number;
          error?: { description?: string; code?: number };
        }>;
        error?: { message?: string; details?: string[] };
      };
      try {
        json = await res.json();
      } catch {
        throw new Error(`Edit failed on "${layer.title}": invalid response from applyEdits.`);
      }

      if (json.error) {
        const msg = json.error.message || json.error.details?.join("; ") || "applyEdits error";
        throw new Error(`Edit failed on "${layer.title}": ${msg}`);
      }

      const rows = json.updateResults ?? [];
      for (const r of rows) {
        if (r.success) updated++;
        else errors.push(r.error?.description || `code ${r.error?.code ?? "?"}`);
      }
    }

    if (!updated && errors.length) {
      throw new Error(
        `Edit failed on "${layer.title}": ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}. OID field used: ${oidField}.`,
      );
    }
    if (!updated) updated = normalized.length;
    return { updated };
  }

  /**
   * Prefer the oid field from schema by type (esriFieldTypeOID / oid), same as
   * the Pro toolbox. Do not trust layer.objectIdField first — it is often
   * "OBJECTID" while the hosted feature service field is "objectid".
   */
  private resolveObjectIdFieldName(layer: EsriLayer): string {
    const fields = layer.fields ?? [];
    const byType = fields.find((f) => {
      const t = (f.type || "").toLowerCase();
      return t === "oid" || t === "esrifieldtypeoid" || t.includes("oid");
    });
    if (byType) return byType.name;
    for (const name of ["objectid", "OBJECTID", "ObjectId", "fid", "FID", "oid", "OID"]) {
      const hit = fields.find((f) => f.name === name);
      if (hit) return hit.name;
    }
    const lower = fields.find(
      (f) =>
        f.name.toLowerCase() === "objectid" ||
        f.name.toLowerCase() === "fid" ||
        f.name.toLowerCase() === "oid",
    );
    if (lower) return lower.name;
    if (typeof layer.objectIdField === "string" && layer.objectIdField.trim()) {
      return layer.objectIdField.trim();
    }
    return "objectid";
  }


  setExtentOverride(extent: unknown | null): void {
    if (!extent) {
      this.extentOverride = null;
      return;
    }
    const ext = extent as { clone?: () => unknown };
    this.extentOverride = typeof ext.clone === "function" ? ext.clone() : extent;
  }

  currentExtent(): unknown | null {
    if (this.extentOverride) {
      const ext = this.extentOverride as { clone?: () => unknown };
      return typeof ext.clone === "function" ? ext.clone() : this.extentOverride;
    }
    if (!this.view?.extent) return null;
    const ext = this.view.extent as { clone?: () => unknown };
    return typeof ext.clone === "function" ? ext.clone() : this.view.extent;
  }

  async zoomToFilters(filters: LocationFilters, unit?: string | null): Promise<void> {
    if (!this.view) return;
    const unitTrim = unit?.trim() || null;
    // Prefer deepest admin selection; if only Unit is set, zoom on District layer by Unit.
    const deepest = [...ADMIN_LEVELS].reverse().find((level) => filters[level.id]);
    if (!deepest && !unitTrim) {
      await this.resetExtent();
      return;
    }
    const targetLevel = deepest ?? ADMIN_LEVELS.find((l) => l.id === "district") ?? ADMIN_LEVELS[0]!;
    const layer = this.findLayer(targetLevel.layerTitles.boundary);
    if (!layer) return;

    const schema = this.schemaOf(layer);
    const fieldNames = schema.map((f) => f.name);
    // whereForLevel 3rd arg is available field names (not unit)
    let where = whereForLevel(targetLevel, filters, fieldNames) || "1=1";

    if (unitTrim) {
      const hasUnit = schema.some((f) => f.name.toLowerCase() === "unit");
      if (hasUnit) {
        const unitField =
          schema.find((f) => f.name.toLowerCase() === "unit")?.name ?? "unit";
        const unitClause = `${unitField} = '${unitTrim.replaceAll("'", "''")}'`;
        where =
          where && where !== "1=1" ? `(${where}) AND (${unitClause})` : unitClause;
      } else {
        try {
          const names = await this.namesForUnitOnLevel(targetLevel, unitTrim, filters);
          const nameFieldOnLayer =
            schema.find((f) => f.name.toLowerCase() === targetLevel.nameField.toLowerCase())
              ?.name ?? null;
          if (names.length && nameFieldOnLayer) {
            const inList = names.map((n) => `'${n.replaceAll("'", "''")}'`).join(",");
            const nameClause = `${nameFieldOnLayer} IN (${inList})`;
            where =
              where && where !== "1=1" ? `(${where}) AND (${nameClause})` : nameClause;
          }
        } catch {
          /* keep admin-only where */
        }
      }
    }

    if (!where) where = "1=1";
    try {
      const result = await layer.queryExtent({ where, returnGeometry: true });
      if (result.count > 0 && result.extent) {
        await this.view.goTo(result.extent, { duration: 700 });
      }
    } catch {
      /* keep current extent */
    }
  }

  async resetExtent(): Promise<void> {
    if (!this.view || !this.initialViewpoint) return;
    this.extentOverride = null;
    await this.view.goTo(this.initialViewpoint, { duration: 700 });
  }

  async goToScale(scale: number): Promise<void> {
    if (!this.view) return;
    await this.view.goTo({ scale }, { duration: 500 });
  }

  async zoomToLevel(levelId: AdminLevelId): Promise<void> {
    if (!this.view) return;
    const level = ADMIN_LEVELS.find((l) => l.id === levelId);
    if (!level) return;
    try {
      await this.view.goTo({ scale: level.viewScale }, { duration: 700 });
    } catch {
      /* ignore */
    }
  }

  async zoomToName(levelId: AdminLevelId, name: string): Promise<void> {
    if (!this.view || !name) return;
    const level = ADMIN_LEVELS.find((l) => l.id === levelId);
    if (!level) return;
    const layer = this.findLayer(level.layerTitles.boundary);
    if (!layer) return;
    const nameField = level.nameField;
    const where = `UPPER(${nameField}) = UPPER('${name.replace(/'/g, "''")}')`;
    try {
      const result = await layer.queryExtent({ where, returnGeometry: true });
      if (result.count > 0 && result.extent) {
        await this.view.goTo(result.extent, { duration: 700 });
      }
    } catch {
      /* ignore */
    }
  }

  async queryAttributes(
    layer: EsriLayer,
    options: {
      where?: string;
      outFields?: string[];
      orderByFields?: string[];
      num?: number;
      returnGeometry?: boolean;
      returnCentroid?: boolean;
      returnDistinctValues?: boolean;
      geometry?: unknown | null;
      ignoreDefinitionExpression?: boolean;
    } = {},
  ): Promise<EsriFeature[]> {
    // Match the working feature-class path: page through results (maxRecordCount safe).
    // When ignoreDefinitionExpression is set, temporarily clear layer filter so joins
    // / symbology can read all attributes even if the map is filtered.
    const prevDef = layer.definitionExpression;
    const clearDef = options.ignoreDefinitionExpression === true;
    if (clearDef) {
      try {
        (layer as { definitionExpression: string | null }).definitionExpression = null;
      } catch {
        try {
          layer.definitionExpression = "1=1";
        } catch {
          /* read-only */
        }
      }
    }

    try {
      const where =
        options.where ||
        (!clearDef ? layer.definitionExpression : null) ||
        "1=1";
      const pageSize = 2000;
      const features: EsriFeature[] = [];
      let start = 0;
      const hardCap = options.num ?? 20_000;
      const geometry = options.geometry ?? null;

      let outFields: string[] | string = options.outFields ?? ["*"];
      let triedStar = outFields === "*" || (Array.isArray(outFields) && outFields.length === 1 && outFields[0] === "*");

      const runPage = async (fields: string[] | string) => {
        const query: Record<string, unknown> = {
          where,
          outFields: fields,
          returnGeometry: options.returnGeometry ?? false,
          returnDistinctValues: options.returnDistinctValues ?? false,
          orderByFields: options.orderByFields,
          num: take,
          start,
        };
        if (options.returnCentroid) query.returnCentroid = true;
        if (geometry) {
          query.geometry = geometry;
          query.spatialRelationship = "intersects";
        }
        return layer.queryFeatures(query);
      };

      // First attempt may fail if outFields lists a field missing on this layer
      // (e.g. adm2_en on a Chart layer) → retry once with "*".
      while (features.length < hardCap) {
        const take = Math.min(pageSize, hardCap - features.length);
        let result: { features?: EsriFeature[]; exceededTransferLimit?: boolean };
        try {
          // rebuild query with current start/take via inline (runPage closes over take/start)
          const query: Record<string, unknown> = {
            where,
            outFields,
            returnGeometry: options.returnGeometry ?? false,
            returnDistinctValues: options.returnDistinctValues ?? false,
            orderByFields: options.orderByFields,
            num: take,
            start,
          };
          if (options.returnCentroid) query.returnCentroid = true;
          if (geometry) {
            query.geometry = geometry;
            query.spatialRelationship = "intersects";
          }
          result = await layer.queryFeatures(query);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!triedStar && (/field name/i.test(msg) || /does not exist/i.test(msg))) {
            outFields = ["*"];
            triedStar = true;
            continue;
          }
          throw err;
        }
        const batch = result.features ?? [];
        features.push(...batch);
        if (!result.exceededTransferLimit || batch.length === 0) break;
        start += batch.length;
      }
      return features;
    } finally {
      if (clearDef) {
        try {
          layer.definitionExpression = prevDef;
        } catch {
          /* restore optional */
        }
      }
    }
  }

  async queryStats(
    layer: EsriLayer,
    stats: Array<{ statisticType: string; onStatisticField: string; outStatisticFieldName: string }>,
    where?: string,
    geometry?: unknown | null,
  ): Promise<Record<string, number>> {
    const query: Record<string, unknown> = {
      where: where || layer.definitionExpression || "1=1",
      outStatistics: stats,
    };
    if (geometry) {
      query.geometry = geometry;
      query.spatialRelationship = "intersects";
    }
    const result = await layer.queryFeatures(query);
    const attrs = result.features?.[0]?.attributes ?? {};
    const out: Record<string, number> = {};
    for (const s of stats) {
      const v = Number(attrs[s.outStatisticFieldName]);
      out[s.outStatisticFieldName] = Number.isFinite(v) ? v : 0;
    }
    return out;
  }

  async queryCount(layer: EsriLayer, where?: string, geometry?: unknown | null): Promise<number> {
    const query: Record<string, unknown> = {
      where: where || layer.definitionExpression || "1=1",
    };
    if (geometry) {
      query.geometry = geometry;
      query.spatialRelationship = "intersects";
    }
    return layer.queryFeatureCount(query);
  }

  /**
   * Click a boundary polygon to drive KPI cards for that area only.
   * Chart layers are ignored. Empty clicks do not clear (use Clear selection).
   */
  private async handleMapClick(event: unknown, events: MapEvents): Promise<void> {
    if (!this.view || !events.onFeatureSelect) return;
    try {
      const response = await this.view.hitTest(event as never);
      const hits = (response?.results ?? []).filter((r) => {
        const layer = r.layer;
        if (!layer) return false;
        if (layer.type && layer.type !== "feature") return false;
        if (isChartLayer(layer)) return false;
        return Boolean(r.graphic);
      });
      if (!hits.length) return;

      const hit = hits[0];
      const layer = hit.layer!;
      const graphic = hit.graphic!;
      const attrs = (graphic.attributes ?? {}) as Record<string, unknown>;

      const title = (layer.title || "").trim().toLowerCase();
      const level =
        ADMIN_LEVELS.find((l) => l.layerTitles.boundary.trim().toLowerCase() === title) ??
        ADMIN_LEVELS.find((l) => title.includes(l.label.toLowerCase()) || title.includes(l.id)) ??
        null;

      let name = "";
      if (level) {
        name = String(attrs[level.nameField] ?? attrs[level.nameField.toLowerCase()] ?? "").trim();
      }
      if (!name) {
        for (const l of [...ADMIN_LEVELS].reverse()) {
          const v = String(attrs[l.nameField] ?? attrs[l.nameField.toLowerCase()] ?? "").trim();
          if (v) {
            name = v;
            break;
          }
        }
      }
      if (!name) {
        for (const [key, val] of Object.entries(attrs)) {
          if (/adm\d_en$/i.test(key) && String(val ?? "").trim()) {
            name = String(val).trim();
            break;
          }
        }
      }
      if (!name) return;

      const rawGeom = graphic.geometry;
      const geometry =
        rawGeom && typeof (rawGeom as { clone?: () => unknown }).clone === "function"
          ? (rawGeom as { clone: () => unknown }).clone()
          : rawGeom;

      const resolvedLevel =
        level ??
        [...ADMIN_LEVELS].reverse().find((l) => String(attrs[l.nameField] ?? "").trim() === name) ??
        null;

      const ancestors: Array<{ label: string; value: string }> = [];
      if (resolvedLevel) {
        for (const parent of ADMIN_LEVELS) {
          if (parent.id === resolvedLevel.id) break;
          const v = String(attrs[parent.nameField] ?? "").trim();
          if (v) ancestors.push({ label: parent.label, value: v });
        }
      }

      await this.highlightFeature(layer, graphic);

      events.onFeatureSelect({
        name,
        geometry: geometry ?? null,
        info: {
          unitLabel: resolvedLevel?.label ?? "Area",
          areaName: name,
          ancestors,
        },
      });
    } catch {
      /* hit-test optional */
    }
  }

  async highlightFeature(layer: EsriLayer, graphic: EsriFeature): Promise<void> {
    if (!this.view) return;
    this.clearHighlight();
    try {
      const layerView = await this.view.whenLayerView(layer);
      const oidField = layer.objectIdField || "OBJECTID";
      const oid = graphic.attributes?.[oidField] ?? graphic.attributes?.objectid;
      this.highlightHandle = layerView.highlight(oid ?? graphic);
    } catch {
      this.highlightHandle = null;
    }
  }

  clearHighlight(): void {
    try {
      this.highlightHandle?.remove();
    } catch {
      /* ignore */
    }
    this.highlightHandle = null;
  }

  setPanelToggleVisibility(opts: { left?: boolean; right?: boolean }): void {
    if (this.filterToggleBtn && typeof opts.left === "boolean") {
      this.filterToggleBtn.style.display = opts.left ? "flex" : "none";
    }
    if (this.symbologyToggleBtn && typeof opts.right === "boolean") {
      this.symbologyToggleBtn.style.display = opts.right ? "flex" : "none";
    }
  }

  /** Show/hide the Clear selection control under the basemap button. */
  setClearSelectionVisible(visible: boolean): void {
    if (!this.clearSelectionBtn) return;
    this.clearSelectionBtn.style.display = visible ? "flex" : "none";
  }

  setOnClearSelection(handler: (() => void) | null): void {
    this.onClearSelection = handler;
  }

  async ensureChartCalloutLayer(): Promise<void> {
    if (this.chartCalloutLayer || !this.webmap || !this.modules) return;
    try {
      const GraphicsLayerMod = await import("@arcgis/core/layers/GraphicsLayer.js");
      const layer = new (GraphicsLayerMod as { default: new (p: unknown) => {
        removeAll: () => void;
        addMany: (g: unknown[]) => void;
        visible: boolean;
      } }).default({ title: "Chart callouts", listMode: "hide" });
      this.chartCalloutLayer = layer;
      (this.webmap.layers as { add?: (l: unknown) => void }).add?.(layer);
    } catch {
      /* optional */
    }
  }

  clearChartCallouts(): void {
    try {
      this.chartCalloutLayer?.removeAll();
    } catch {
      /* ignore */
    }
  }

  /** Remove client-side joined chart layers and restore original chart visibility. */
  clearJoinedChartLayers(): void {
    if (!this.webmap) {
      this.joinedChartLayers.clear();
      return;
    }
    for (const [, entry] of this.joinedChartLayers) {
      try {
        (this.webmap.layers as { remove?: (l: unknown) => void }).remove?.(entry.layer);
      } catch {
        /* ignore */
      }
      try {
        const orig = this.findLayerById(entry.originalId);
        if (orig) orig.visible = entry.originalVisible;
      } catch {
        /* ignore */
      }
    }
    this.joinedChartLayers.clear();
  }

  private findLayerById(id: string): EsriLayer | null {
    if (!this.webmap) return null;
    for (const layer of this.featureLayers()) {
      if (layer.id === id) return layer;
    }
    return null;
  }

  /** Normalize place names so geometry labels match table labels. */
  private normPlace(value: unknown): string {
    let s = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    s = s.replace(/\bbarishal\b/g, "barisal");
    s = s.replace(/\bchattogram\b/g, "chittagong");
    s = s.replace(/\bbogura\b/g, "bogra");
    s = s.replace(/\bjashore\b/g, "jessore");
    s = s.replace(/\bcumilla\b/g, "comilla");
    return s;
  }

  /**
   * Build (once) a point-centroid cache for a chart/boundary layer.
   * One entry per admin unit = union of all polygon parts → centroid.
   * Subsequent chart applies reuse this cache (no re-query / re-centroid).
   * Uses service centroids / geometry (no admin chart-locations JSON required).
   */
  private async ensureCentroidCache(
    layer: EsriLayer,
    keyField: string,
  ): Promise<Map<string, { geometry: unknown; attrs: Record<string, unknown>; name: string }>> {
    const existing = this.centroidCache.get(layer.id);
    if (existing && existing.size > 0) return existing;

    // Service centroids / light geometry query (preferred — fields live on layers)
    const oid = layer.objectIdField || "OBJECTID";
    // Use "*" — named fields like adm2_en may be missing on some Chart layers
    let features = await this.queryAttributes(layer, {
      where: "1=1",
      outFields: ["*"],
      returnGeometry: false,
      returnCentroid: true,
      ignoreDefinitionExpression: true,
      num: 50_000,
    });

    type Feat = EsriFeature & { centroid?: unknown };
    const pickGeom = (f: Feat): unknown => f.centroid ?? f.geometry ?? null;

    let withGeom = (features as Feat[]).filter((f) => pickGeom(f));
    if (withGeom.length < Math.max(1, Math.floor(features.length * 0.2))) {
      features = await this.queryAttributes(layer, {
        where: "1=1",
        outFields: ["*"],
        returnGeometry: true,
        ignoreDefinitionExpression: true,
        num: 50_000,
      });
      withGeom = (features as Feat[]).filter((f) => f.geometry);
    }

    let toCentroid: ((g: unknown) => unknown) | null = null;
    try {
      const geMod = await import("@arcgis/core/geometry/geometryEngine.js");
      const ge = geMod as {
        centroid?: (g: unknown) => unknown;
        default?: { centroid?: (g: unknown) => unknown };
      };
      toCentroid = ge.centroid ?? ge.default?.centroid ?? null;
    } catch {
      toCentroid = null;
    }

    const cache = new Map<
      string,
      { geometry: unknown; attrs: Record<string, unknown>; name: string }
    >();
    for (const f of withGeom) {
      const attrs = { ...(f.attributes ?? {}) };
      let name = "";
      for (const [k, v] of Object.entries(attrs)) {
        if (k.toLowerCase() === keyField.toLowerCase()) {
          name = String(v ?? "").trim();
          break;
        }
      }
      if (!name) continue;
      let geom: unknown = pickGeom(f as Feat);
      if (!geom) continue;
      const gType = (geom as { type?: string }).type;
      if (toCentroid && gType && gType !== "point") {
        try {
          const c = toCentroid(geom);
          if (c) geom = c;
        } catch {
          /* keep */
        }
      }
      const nk = this.normPlace(name);
      if (!cache.has(nk)) {
        cache.set(nk, { geometry: geom, attrs, name });
      }
    }

    this.centroidCache.set(layer.id, cache);
    return cache;
  }

  /**
   * Load precomputed chart points from public/chart-locations/{division|district|upazila|union}.json
   * Format: [{ x, y, wkid, adm1_en|adm2_en|… }]
   */
  private async loadChartLocationsFromJson(
    layer: EsriLayer,
    keyField: string,
  ): Promise<Map<string, { geometry: unknown; attrs: Record<string, unknown>; name: string }> | null> {
    const title = (layer.title || "").toLowerCase();
    let level: string | null = null;
    if (title.includes("union")) level = "union";
    else if (title.includes("upazila")) level = "upazila";
    else if (title.includes("district")) level = "district";
    else if (title.includes("division")) level = "division";
    else {
      const kf = keyField.toLowerCase();
      if (kf.includes("adm4") || kf === "union") level = "union";
      else if (kf.includes("adm3") || kf === "upazila") level = "upazila";
      else if (kf.includes("adm2") || kf === "district") level = "district";
      else if (kf.includes("adm1") || kf === "division") level = "division";
    }
    if (!level) return null;

    try {
      const res = await fetch(`/chart-locations/${level}.json`, { cache: "force-cache" });
      if (!res.ok) return null;
      const data = (await res.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(data) || !data.length) return null;

      const PointMod = await import("@arcgis/core/geometry/Point.js");
      const Point = (PointMod as { default: new (p: unknown) => unknown }).default;

      const nameKeys = [
        keyField,
        "adm4_en",
        "adm3_en",
        "adm2_en",
        "adm1_en",
        "Unit",
        "name",
      ];

      const cache = new Map<
        string,
        { geometry: unknown; attrs: Record<string, unknown>; name: string }
      >();

      for (const row of data) {
        const x = Number(row.x ?? row.lon ?? row.longitude ?? row.X);
        const y = Number(row.y ?? row.lat ?? row.latitude ?? row.Y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        let name = "";
        for (const k of nameKeys) {
          if (!k) continue;
          for (const [rk, rv] of Object.entries(row)) {
            if (rk.toLowerCase() === k.toLowerCase() && rv != null && String(rv).trim()) {
              name = String(rv).trim();
              break;
            }
          }
          if (name) break;
        }
        if (!name) continue;

        const wkid = Number(row.wkid ?? row.spatialReference ?? 4326) || 4326;
        const geometry = new Point({
          x,
          y,
          spatialReference: { wkid },
        });

        const nk = this.normPlace(name);
        if (!cache.has(nk)) {
          cache.set(nk, {
            geometry,
            attrs: { ...row, [keyField]: name },
            name,
          });
        }
      }

      return cache.size ? cache : null;
    } catch {
      return null;
    }
  }

  /** Drop cached centroids (e.g. after web map swap). Chart apply will rebuild. */
  clearCentroidCache(layerId?: string): void {
    if (layerId) {
      this.centroidCache.delete(layerId);
    } else {
      this.centroidCache.clear();
    }
  }

  /**
   * Apply a pie-chart (or any) renderer using joined table values.
   * Builds a client-side FeatureLayer from cached unit centroids so attributes
   * exist on features. First call per layer builds the centroid cache; later
   * calls are fast (no polygon query / union).
   */
  async applyJoinedChartRenderer(options: {
    layer: EsriLayer;
    rendererJson: EsriRenderer;
    rows: Array<Record<string, unknown>>;
    keyField: string;
    valueFields: string[];
    /** Optional size driver field (indicator). When omitted, size = sum of pie slices. */
    sizeField?: string | null;
  }): Promise<void> {
    if (!this.modules || !this.webmap) return;
    const { layer, rows, keyField, valueFields, sizeField } = options;
    // Rebuild centroids when keyField changes (adm2_en vs unit etc.)
    this.centroidCache.delete(layer.id);
    // Clone renderer so we can rewrite size visual variable safely
    const rendererJson = JSON.parse(JSON.stringify(options.rendererJson)) as EsriRenderer;

    // Index joined rows by admin name (+ Unit / Custom_Unit_Code fallbacks)
    const byKey = new Map<string, Record<string, unknown>>();
    const addKey = (k: string, row: Record<string, unknown>) => {
      const nk = this.normPlace(k);
      if (!nk) return;
      const prev = byKey.get(nk);
      if (!prev) {
        byKey.set(nk, row);
        return;
      }
      const merged = { ...prev };
      for (const [fk, fv] of Object.entries(row)) {
        const n = Number(fv);
        if (Number.isFinite(n) && typeof prev[fk] !== "string") {
          const pn = Number(prev[fk]);
          merged[fk] = (Number.isFinite(pn) ? pn : 0) + n;
        }
      }
      byKey.set(nk, merged);
    };
    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) {
        if (k.toLowerCase() === keyField.toLowerCase()) {
          addKey(String(v ?? ""), row);
        }
      }
      for (const alt of ["adm1_en", "adm2_en", "adm3_en", "adm4_en", "Unit", "Custom_Unit_Code"]) {
        for (const [k, v] of Object.entries(row)) {
          if (k.toLowerCase() === alt.toLowerCase()) {
            addKey(String(v ?? ""), row);
          }
        }
      }
    }

    const vv = (rendererJson.visualVariables as Array<Record<string, unknown>> | undefined) ?? [];
    const sizeVV = vv.find((v) => String(v.type) === "sizeInfo");
    // Explicit size field from Apply panel; never guess from last valueField
    const sizeFieldHint = (sizeField && String(sizeField).trim()) || null;

    const attrNum = (row: Record<string, unknown> | undefined, field: string): number => {
      if (!row || !field) return 0;
      if (field in row) {
        const n = Number(row[field]);
        return Number.isFinite(n) ? Math.max(0, n) : 0;
      }
      const lower = field.toLowerCase();
      for (const [k, v] of Object.entries(row)) {
        if (k.toLowerCase() === lower) {
          const n = Number(v);
          return Number.isFinite(n) ? Math.max(0, n) : 0;
        }
      }
      return 0;
    };

    /** Size = selected size field, else sum of pie slice fields. */
    const sizeOf = (hit: Record<string, unknown> | undefined): number => {
      if (!hit) return 0;
      if (sizeFieldHint) return attrNum(hit, sizeFieldHint);
      let total = 0;
      for (const vf of valueFields) total += attrNum(hit, vf);
      return total;
    };

    const cache = await this.ensureCentroidCache(layer, keyField);
    const oidField = layer.objectIdField || "OBJECTID";

    const graphics: unknown[] = [];
    const sizeValues: number[] = [];
    let oid = 1;
    for (const { geometry, attrs, name } of cache.values()) {
      const hit = byKey.get(this.normPlace(name));
      const merged: Record<string, unknown> = { ...attrs, [oidField]: oid++ };
      for (const vf of valueFields) {
        merged[vf] = attrNum(hit, vf);
      }
      merged[keyField] = name;

      // Baked numeric size — reliable for pieChart size visual variable on client layers
      const chartSize = sizeOf(hit);
      merged.__chart_size__ = chartSize;

      // Skip empty pies (no slice data)
      const hasSlice = valueFields.some((vf) => attrNum(hit, vf) > 0);
      if (!hasSlice && chartSize <= 0) continue;
      if (!hasSlice) continue;

      sizeValues.push(chartSize);
      graphics.push({
        geometry,
        attributes: merged,
      });
    }

    if (!graphics.length) {
      throw new Error(
        `No chart features could be built for "${layer.title || layer.id}". Check joins and filters.`,
      );
    }

    // Rewrite size visual variable to use baked __chart_size__ field (not Arcade).
    // Arcade valueExpression often fails on client-side FeatureLayer graphics → equal sizes.
    let minDataValue = sizeValues.length ? Math.min(...sizeValues) : 0;
    let maxDataValue = sizeValues.length ? Math.max(...sizeValues) : 1;
    if (maxDataValue <= 0) {
      minDataValue = 0;
      maxDataValue = 1;
    } else if (minDataValue === maxDataValue) {
      // Single value → still allow a range so symbols are not collapsed
      minDataValue = 0;
    }
    const minSize = Number(sizeVV?.minSize) || 12;
    const maxSize = Number(sizeVV?.maxSize) || 48;
    const sizeTitle = String(sizeVV?.valueExpressionTitle || sizeVV?.legendOptions || "Size");

    rendererJson.visualVariables = [
      {
        type: "sizeInfo",
        field: "__chart_size__",
        valueExpressionTitle: sizeTitle,
        minDataValue,
        maxDataValue,
        minSize,
        maxSize,
      },
    ];
    // Keep a sensible default size when VV cannot apply
    if (rendererJson.size == null) rendererJson.size = 24;

    // Remove previous joined layer for this source
    const prev = this.joinedChartLayers.get(layer.id);
    if (prev) {
      try {
        (this.webmap.layers as { remove?: (l: unknown) => void }).remove?.(prev.layer);
      } catch {
        /* ignore */
      }
      this.joinedChartLayers.delete(layer.id);
    }

    const FeatureLayerMod = await import("@arcgis/core/layers/FeatureLayer.js");
    const FeatureLayer = (FeatureLayerMod as { default: new (p: unknown) => EsriLayer }).default;

    const fields: Array<{ name: string; type: string; alias?: string }> = [
      { name: oidField, type: "oid" },
      { name: keyField, type: "string" },
      { name: "__chart_size__", type: "double", alias: "Chart size" },
    ];
    for (const vf of valueFields) {
      if (!fields.some((f) => f.name === vf)) {
        fields.push({ name: vf, type: "double", alias: vf });
      }
    }
    for (const af of ["adm1_en", "adm2_en", "adm3_en", "adm4_en", "Unit", "Custom_Unit_Code"]) {
      if (!fields.some((f) => f.name === af)) {
        fields.push({ name: af, type: "string" });
      }
    }

    const sampleGeom = (graphics[0] as { geometry?: { spatialReference?: unknown } } | undefined)
      ?.geometry;

    // Scale dependency: prefer web-map layer values, else ADMIN_LEVELS ranges
    const titleLower = (layer.title || "").trim().toLowerCase();
    const levelMatch = ADMIN_LEVELS.find(
      (l) =>
        l.layerTitles.chart.toLowerCase() === titleLower ||
        l.layerTitles.boundary.toLowerCase() === titleLower ||
        (layer.title || "").toLowerCase().includes(l.id),
    );
    let minScale = Number(layer.minScale);
    let maxScale = Number(layer.maxScale);
    if (!Number.isFinite(minScale) || minScale < 0) minScale = 0;
    if (!Number.isFinite(maxScale) || maxScale < 0) maxScale = 0;
    if (minScale === 0 && maxScale === 0 && levelMatch) {
      minScale = levelMatch.minScale;
      maxScale = levelMatch.maxScale;
    }

    const renderer = this.modules.jsonUtils.fromJSON(rendererJson);
    const client = new FeatureLayer({
      source: graphics,
      objectIdField: oidField,
      fields,
      geometryType: "point",
      spatialReference: sampleGeom?.spatialReference,
      renderer,
      title: `${layer.title || "Chart"} (data)`,
      listMode: "hide",
      popupEnabled: true,
      outFields: ["*"],
      opacity: layer.opacity ?? 1,
      minScale,
      maxScale,
    }) as EsriLayer & { minScale?: number; maxScale?: number };

    try {
      client.minScale = minScale;
      client.maxScale = maxScale;
    } catch {
      /* ignore */
    }

    const originalVisible = layer.visible;
    layer.visible = false;

    (this.webmap.layers as { add?: (l: unknown) => void }).add?.(client);
    this.joinedChartLayers.set(layer.id, {
      layer: client,
      originalId: layer.id,
      originalVisible,
    });

    if (!this.originalRenderers.has(layer.id)) {
      this.originalRenderers.set(layer.id, layer.renderer ?? null);
    }
  }


  applyRenderer(layer: EsriLayer, rendererJson: EsriRenderer): void {
    if (!this.modules) return;
    if (!this.originalRenderers.has(layer.id)) {
      this.originalRenderers.set(layer.id, layer.renderer ?? null);
    }
    try {
      layer.outFields = ["*"];
    } catch {
      /* ignore */
    }
    layer.renderer = this.modules.jsonUtils.fromJSON(rendererJson);
    // Never leave boundary layers hidden after Apply (basemap-only symptom)
    layer.visible = true;
    // Drop definitionExpression that references fields absent on this layer
    // (e.g. adm2_en on a layer without that field → blank map / query errors).
    try {
      const def = String(layer.definitionExpression || "").trim();
      if (!def || def === "1=0") {
        layer.definitionExpression = "1=1";
      } else if (def !== "1=1") {
        const schemaNames = new Set(
          (layer.fields ?? []).map((f) => String(f.name || "").toLowerCase()),
        );
        if (schemaNames.size) {
          const mentioned = def.match(/\b(adm[1-4]_en|unit|custom_unit_code)\b/gi) ?? [];
          const bad = mentioned.some((f) => !schemaNames.has(f.toLowerCase()));
          if (bad) layer.definitionExpression = "1=1";
        }
      }
    } catch {
      /* ignore */
    }
    if (isChartLayer(layer)) {
      layer.popupEnabled = false;
    } else {
      layer.popupEnabled = true;
      if (!layer.popupTemplate && this.originalPopupTemplates.has(layer.id)) {
        layer.popupTemplate = this.originalPopupTemplates.get(layer.id) ?? null;
      }
    }
    try {
      (layer as { refresh?: () => void }).refresh?.();
    } catch {
      /* optional */
    }
  }

  resetRenderers(group?: LayerGroupId): void {
    if (!group || group === "chart") {
      this.clearChartCallouts();
      this.clearJoinedChartLayers();
    }
    for (const layer of this.featureLayers()) {
      if (group) {
        const chart = isChartLayer(layer);
        if (group === "chart" && !chart) continue;
        if (group === "boundary" && chart) continue;
      }
      if (this.originalRenderers.has(layer.id)) {
        layer.renderer = this.originalRenderers.get(layer.id) as EsriLayer["renderer"];
      }
      try {
        (layer as { refresh?: () => void }).refresh?.();
      } catch {
        /* optional */
      }
      if (isChartLayer(layer)) {
        layer.popupEnabled = false;
      } else {
        layer.popupEnabled = true;
      }
    }
  }

  setPadding(padding: Partial<EsriMapView["padding"]>): void {
    if (!this.view) return;
    this.view.padding = { ...this.view.padding, ...padding };
  }

  destroy(): void {
    this.clearHighlight();
    this.clearJoinedChartLayers();
    this.clearCentroidCache();
    for (const h of this.handles) {
      try {
        h.remove();
      } catch {
        /* ignore */
      }
    }
    this.handles = [];
    for (const w of this.widgets) {
      try {
        w.destroy();
      } catch {
        /* ignore */
      }
    }
    this.widgets = [];
    try {
      this.view?.destroy();
    } catch {
      /* ignore */
    }
    this.view = null;
    this.webmap = null;
    this.modules = null;
  }
}

let singleton: MapController | null = null;

export function getMapController(): MapController | null {
  return singleton;
}

export async function createMapController(
  container: HTMLDivElement,
  events: MapEvents = {},
): Promise<MapController> {
  if (singleton) {
    singleton.destroy();
    singleton = null;
  }
  const controller = new MapController();
  singleton = controller;
  await controller.init(container, events);
  return controller;
}

export function clearMapController(): void {
  singleton?.destroy();
  singleton = null;
}

export type { AppliedLegend };
