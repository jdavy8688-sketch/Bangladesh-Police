import { useEffect, useRef } from "react";
import { getAppConfig } from "@/config/app-config";
import { ADMIN_LEVELS, scaleToLevel, type LocationFilters } from "@/config/layers";
import { whereForLevel } from "@/lib/gis/where";
import { getMapController } from "@/lib/gis/map-controller";
import { useAppStore } from "@/store/app-store";

type PreviewView = {
  destroy: () => void;
  goTo: (t: unknown, o?: unknown) => Promise<unknown>;
  when: () => Promise<void>;
  resize?: () => void;
  extent: unknown;
  scale: number;
  map?: unknown;
  container?: HTMLDivElement | string | null;
  watch: (prop: string, cb: (v: unknown) => void) => { remove: () => void };
  on: (event: string, cb: (e: unknown) => void) => { remove: () => void };
  hitTest: (e: unknown) => Promise<{
    results: Array<{
      graphic?: { attributes?: Record<string, unknown>; geometry?: unknown; layer?: unknown };
      layer?: { title?: string; type?: string };
    }>;
  }>;
  popup: {
    open: (opts: unknown) => void;
    close: () => void;
    autoOpenEnabled?: boolean;
  };
  ui: {
    add: (w: unknown, pos?: string) => void;
    remove: (w: unknown) => void;
  };
  viewpoint: { clone: () => unknown };
  whenLayerView?: (layer: unknown) => Promise<{ highlight: (g: unknown) => { remove: () => void } }>;
};

type PreviewLayer = {
  title: string;
  type: string;
  renderer?: unknown;
  definitionExpression?: string;
  visible?: boolean;
  opacity?: number;
  popupEnabled?: boolean;
  outFields?: string[] | string;
  queryExtent?: (query: Record<string, unknown>) => Promise<{ extent: unknown; count: number }>;
  fields?: Array<{ name: string }>;
  refresh?: () => void;
};

type PreviewWebMap = {
  load: () => Promise<unknown>;
  destroy?: () => void;
  allLayers: { toArray: () => PreviewLayer[] };
};

/**
 * Same filter rules as main map:
 * - Admin cascade (Division → District → Upazila → Union)
 * - Optional Unit on the expression when the layer has a Unit field
 * - Hide coarser Boundary/Chart layers when a finer filter is selected
 *   (e.g. Union selected → hide full Upazila polygon)
 */
function applyFiltersToPreview(
  webmap: PreviewWebMap,
  filters: LocationFilters,
  unit?: string | null,
): void {
  const unitTrim = unit?.trim() || null;
  const levelOrder = ADMIN_LEVELS.map((l) => l.id);
  const deepestIdx = [...levelOrder]
    .map((id, i) => (filters[id] ? i : -1))
    .filter((i) => i >= 0)
    .reduce((a, b) => Math.max(a, b), -1);

  for (let li = 0; li < ADMIN_LEVELS.length; li++) {
    const level = ADMIN_LEVELS[li]!;
    const hideCoarser = deepestIdx >= 0 && li < deepestIdx;

    for (const group of ["boundary", "chart"] as const) {
      const title = level.layerTitles[group].trim().toLowerCase();
      const layer = webmap.allLayers
        .toArray()
        .find((l) => (l.title || "").trim().toLowerCase() === title);
      if (!layer) continue;

      let expression: string;
      if (hideCoarser) {
        expression = "1=0";
      } else {
        const hasUnit =
          Array.isArray(layer.fields) &&
          layer.fields.some((f) => (f.name || "").toLowerCase() === "unit");
        expression = whereForLevel(level, filters, hasUnit ? unitTrim : null) || "1=1";
        if (!expression) expression = "1=1";
      }

      layer.definitionExpression = expression;
      try {
        layer.refresh?.();
      } catch {
        /* optional */
      }
    }
  }
}

/**
 * Independent MapView for the analytics modal.
 * Does not require the main map to be ready — critical after refresh with the window open.
 */
export function AnalyticsMapPreview() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let view: PreviewView | null = null;
    let webmap: PreviewWebMap | null = null;
    const handles: Array<{ remove: () => void }> = [];
    const widgets: Array<{ destroy?: () => void }> = [];
    let unsubStore: (() => void) | null = null;
    let programmaticZoom = false;

    const restoreMainMap = () => {
      const main = getMapController()?.view as { resize?: () => void } | null | undefined;
      if (!main) return;
      try {
        main.resize?.();
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        try {
          main.resize?.();
        } catch {
          /* ignore */
        }
      }, 100);
    };

    const applyScaleToStore = (scale: number) => {
      if (cancelled || !Number.isFinite(scale) || scale <= 0) return;
      const level = scaleToLevel(scale);
      useAppStore.getState().setScale(level, scale);
    };

    const clearLocalHighlight = () => {
      try {
        highlightRef.current?.remove();
      } catch {
        /* ignore */
      }
      highlightRef.current = null;
    };

    const zoomPreviewToFilters = async (
      previewView: PreviewView,
      previewMap: PreviewWebMap,
      filters: LocationFilters,
      unit?: string | null,
    ) => {
      const deepest = [...ADMIN_LEVELS].reverse().find((level) => filters[level.id]);
      if (!deepest && !(unit && unit.trim())) {
        const main = getMapController();
        if (main?.view) {
          try {
            programmaticZoom = true;
            await previewView.goTo(
              (main.view as { viewpoint: { clone: () => unknown } }).viewpoint.clone(),
              { duration: 700 },
            );
          } catch {
            /* ignore */
          }
        }
        return;
      }
      const targetLevel =
        deepest ?? ADMIN_LEVELS.find((l) => l.id === "district") ?? ADMIN_LEVELS[0]!;
      const title = targetLevel.layerTitles.boundary.trim().toLowerCase();
      const layer = previewMap.allLayers
        .toArray()
        .find((l) => (l.title || "").trim().toLowerCase() === title);
      if (!layer?.queryExtent) return;

      const hasUnit =
        Array.isArray(layer.fields) &&
        layer.fields.some((f) => (f.name || "").toLowerCase() === "unit");
      const where =
        whereForLevel(targetLevel, filters, hasUnit ? unit : null) || "1=1";

      try {
        const result = await layer.queryExtent({ where, returnGeometry: true });
        if (result.count > 0 && result.extent) {
          programmaticZoom = true;
          await previewView.goTo(result.extent, { duration: 700 });
        }
      } catch {
        /* keep current extent */
      }
    };

    (async () => {
      try {
        const config = getAppConfig();
        const [
          configMod,
          webmapMod,
          viewMod,
          zoomMod,
          homeMod,
          expandMod,
          basemapMod,
          layerListMod,
        ] = await Promise.all([
          import("@arcgis/core/config.js"),
          import("@arcgis/core/WebMap.js"),
          import("@arcgis/core/views/MapView.js"),
          import("@arcgis/core/widgets/Zoom.js"),
          import("@arcgis/core/widgets/Home.js"),
          import("@arcgis/core/widgets/Expand.js"),
          import("@arcgis/core/widgets/BasemapGallery.js"),
          import("@arcgis/core/widgets/LayerList.js"),
        ]);

        if (cancelled || !hostRef.current) return;

        const esriConfig = configMod.default as { portalUrl: string; assetsPath: string };
        esriConfig.portalUrl = config.portalUrl;
        esriConfig.assetsPath = `https://js.arcgis.com/${config.arcgisVersion}/@arcgis/core/assets`;

        const WebMap = webmapMod.default as unknown as new (p: unknown) => PreviewWebMap;
        const MapView = viewMod.default as unknown as new (p: unknown) => PreviewView;
        const Zoom = zoomMod.default as unknown as new (p: unknown) => { destroy: () => void };
        const Home = homeMod.default as unknown as new (p: unknown) => { destroy: () => void };
        const Expand = expandMod.default as unknown as new (p: unknown) => { destroy: () => void };
        const BasemapGallery = basemapMod.default as unknown as new (p: unknown) => {
          destroy: () => void;
        };
        const LayerList = layerListMod.default as unknown as new (p: unknown) => {
          destroy: () => void;
        };

        webmap = new WebMap({
          portalItem: { id: config.webmapId, portal: { url: config.portalUrl } },
        });

        // Optional: inherit viewpoint from main map if it is already ready.
        const main = getMapController();
        const viewpoint = main?.view
          ? (main.view as { viewpoint: { clone: () => unknown } }).viewpoint.clone()
          : undefined;

        view = new MapView({
          container: hostRef.current,
          map: webmap,
          constraints: { snapToZoom: false },
          ui: { components: ["attribution"] },
          ...(viewpoint ? { viewpoint } : {}),
          popup: {
            autoOpenEnabled: true,
            dockEnabled: false,
          },
        });

        await view.when();
        if (cancelled) {
          try {
            view.container = null;
            view.destroy();
          } catch {
            /* ignore */
          }
          return;
        }

        // Apply current store filters (admin + Unit) — same as main map.
        const store = useAppStore.getState();
        applyFiltersToPreview(webmap, store.filters, store.crimeFilters.unit);

        // Best-effort: copy renderers from main map when available.
        try {
          const ctrl = getMapController();
          if (ctrl?.view) {
            const mainLayers = ctrl.featureLayers();
            const byTitle = new Map(
              mainLayers.map((l) => [(l.title || "").trim().toLowerCase(), l] as const),
            );
            for (const layer of webmap.allLayers.toArray()) {
              if (layer.type !== "feature") continue;
              const src = byTitle.get((layer.title || "").trim().toLowerCase());
              if (!src) continue;
              if (src.renderer !== undefined) layer.renderer = src.renderer;
              if (typeof src.visible === "boolean") layer.visible = src.visible;
              if (typeof src.opacity === "number") layer.opacity = src.opacity;
              if (!/chart/i.test(layer.title || "")) {
                layer.popupEnabled = true;
                layer.outFields = ["*"];
              }
            }
          } else {
            for (const layer of webmap.allLayers.toArray()) {
              if (layer.type !== "feature") continue;
              if (!/chart/i.test(layer.title || "")) {
                layer.popupEnabled = true;
                layer.outFields = ["*"];
              }
            }
          }
        } catch {
          /* best-effort */
        }

        const home = new Home({ view });
        const zoom = new Zoom({ view, layout: "horizontal" });
        const basemapGallery = new BasemapGallery({ view });
        const basemapExpand = new Expand({
          view,
          content: basemapGallery,
          expandIcon: "basemap",
          expandTooltip: "Basemap",
          mode: "floating",
        });
        const layerList = new LayerList({ view });
        const layerListExpand = new Expand({
          view,
          content: layerList,
          expandIcon: "layers",
          expandTooltip: "Layers",
          mode: "floating",
        });
        view.ui.add(home, "top-left");
        view.ui.add(basemapExpand, "top-left");
        view.ui.add(layerListExpand, "top-left");
        view.ui.add(zoom, "bottom-left");

        // Clear selection — icon only, same style as main map
        const clearSelBtn = document.createElement("button");
        clearSelBtn.type = "button";
        clearSelBtn.className = "esri-widget esri-widget--button";
        clearSelBtn.title = "Clear selection";
        clearSelBtn.setAttribute("aria-label", "Clear selection");
        clearSelBtn.innerHTML = `<calcite-icon icon="reset" scale="m"></calcite-icon>`;
        clearSelBtn.style.display = "none";
        clearSelBtn.addEventListener("click", () => {
          clearLocalHighlight();
          try {
            view?.popup.close();
          } catch {
            /* ignore */
          }
          useAppStore.getState().clearMapSelection();
          clearSelBtn.style.display = "none";
        });
        view.ui.add(clearSelBtn, "top-left");

        widgets.push(home, zoom, basemapGallery, basemapExpand, layerList, layerListExpand);

        handles.push(
          view.watch("scale", (scale) => {
            if (programmaticZoom) return;
            if (typeof scale === "number") applyScaleToStore(scale);
          }),
        );

        const onSettled = () => {
          if (!view || cancelled) return;
          if (!programmaticZoom) {
            applyScaleToStore(view.scale);
          }
          if (!useAppStore.getState().selectionGeometry) {
            getMapController()?.setExtentOverride(view.extent);
            void useAppStore.getState().refreshAnalytics();
          }
        };

        handles.push(
          view.watch("stationary", (stationary) => {
            if (stationary) {
              programmaticZoom = false;
              onSettled();
            }
          }),
        );

        handles.push(
          view.on("click", async (event) => {
            if (!view || cancelled) return;
            try {
              const hit = await view.hitTest(event);
              const match = hit.results.find((r) => {
                const title = (r.layer?.title || "").toLowerCase();
                return r.graphic && r.layer?.type === "feature" && !title.includes("chart");
              });
              if (!match?.graphic) return;
              const graphic = match.graphic;
              const attrs = graphic.attributes ?? {};
              const name =
                String(
                  attrs.adm4_en ??
                    attrs.adm3_en ??
                    attrs.adm2_en ??
                    attrs.adm1_en ??
                    attrs.NAME ??
                    "Selected area",
                ) || "Selected area";
              const geom = graphic.geometry ?? null;
              clearLocalHighlight();
              if (match.layer && view.whenLayerView && geom) {
                try {
                  const lv = await view.whenLayerView(match.layer);
                  highlightRef.current = lv.highlight(graphic);
                } catch {
                  /* optional */
                }
              }
              try {
                view.popup.open({
                  location: (event as { mapPoint?: unknown }).mapPoint,
                  title: name,
                  content: Object.entries(attrs)
                    .slice(0, 12)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("<br/>"),
                });
              } catch {
                /* popup optional */
              }
              useAppStore.getState().setMapSelection(name, geom);
              clearSelBtn.style.display = "flex";
            } catch {
              /* ignore */
            }
          }),
        );

        await zoomPreviewToFilters(view, webmap, store.filters, store.crimeFilters.unit);

        applyScaleToStore(view.scale);
        onSettled();

        let prevFilters = useAppStore.getState().filters;
        let prevUnit = useAppStore.getState().crimeFilters.unit;
        let prevSel = useAppStore.getState().selectionGeometry;
        unsubStore = useAppStore.subscribe((state) => {
          if (cancelled || !view || !webmap) return;
          if (state.filters !== prevFilters || state.crimeFilters.unit !== prevUnit) {
            prevFilters = state.filters;
            prevUnit = state.crimeFilters.unit;
            applyFiltersToPreview(webmap, state.filters, state.crimeFilters.unit);
            void zoomPreviewToFilters(view, webmap, state.filters, state.crimeFilters.unit);
          }
          if (!state.selectionGeometry && prevSel) {
            clearLocalHighlight();
            try {
              view.popup.close();
            } catch {
              /* ignore */
            }
            clearSelBtn.style.display = "none";
          }
          if (state.selectionGeometry) {
            clearSelBtn.style.display = "flex";
          }
          prevSel = state.selectionGeometry;
        });

        if (typeof ResizeObserver !== "undefined" && hostRef.current) {
          const ro = new ResizeObserver(() => {
            if (!cancelled) view?.resize?.();
          });
          ro.observe(hostRef.current);
          handles.push({ remove: () => ro.disconnect() });
        }

        window.setTimeout(() => view?.resize?.(), 80);
        window.setTimeout(() => view?.resize?.(), 300);
      } catch (err) {
        console.error("[AnalyticsMapPreview] failed to init", err);
      }
    })();

    return () => {
      cancelled = true;
      unsubStore?.();
      clearLocalHighlight();
      for (const h of handles) {
        try {
          h.remove();
        } catch {
          /* ignore */
        }
      }
      for (const w of widgets) {
        try {
          w.destroy?.();
        } catch {
          /* ignore */
        }
      }
      getMapController()?.setExtentOverride(null);
      useAppStore.getState().clearMapSelection();

      try {
        if (view) {
          view.container = null;
          view.destroy();
        }
      } catch {
        /* ignore */
      }
      view = null;

      try {
        webmap?.destroy?.();
      } catch {
        /* ignore */
      }
      webmap = null;

      restoreMainMap();
      void useAppStore.getState().refreshAnalytics();
    };
  }, []);

  return (
    <div className="analytics-map-preview">
      <div ref={hostRef} className="analytics-map-preview-host" aria-label="Web map preview" />
    </div>
  );
}
