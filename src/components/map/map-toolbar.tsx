import { useEffect, useState } from "react";
import { LegendPanel } from "@/components/symbology/legend-panel";
import { getMapController } from "@/lib/gis/map-controller";
import { useAppStore } from "@/store/app-store";

type PanelId = "legend" | "basemap" | null;

const BASEMAPS: Array<{ id: string; label: string; style: string }> = [
  { id: "streets-vector", label: "Streets", style: "streets-vector" },
  { id: "topo-vector", label: "Topographic", style: "topo-vector" },
  { id: "gray-vector", label: "Light gray", style: "gray-vector" },
  { id: "dark-gray-vector", label: "Dark gray", style: "dark-gray-vector" },
  { id: "satellite", label: "Imagery", style: "satellite" },
  { id: "hybrid", label: "Imagery hybrid", style: "hybrid" },
];

/**
 * Horizontal map toolbar: zoom − / +, home, legend, basemap, clear selection.
 * Centered at the top of the map with even gaps.
 */
export function MapToolbar() {
  const [open, setOpen] = useState<PanelId>(null);
  const [activeBasemap, setActiveBasemap] = useState<string>("streets-vector");
  const applied = useAppStore((s) => s.applied);
  const selectionName = useAppStore((s) => s.selectionName);
  const clearMapSelection = useAppStore((s) => s.clearMapSelection);
  const hasLegend = Boolean(applied.boundary || applied.chart);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = (id: PanelId) => setOpen((cur) => (cur === id ? null : id));

  const zoom = async (direction: "in" | "out") => {
    const ctrl = getMapController();
    const view = ctrl?.view as
      | { scale: number; goTo: (t: unknown, o?: unknown) => Promise<unknown> }
      | null
      | undefined;
    if (!view) return;
    const factor = direction === "in" ? 0.5 : 2;
    await view.goTo({ scale: view.scale * factor }, { duration: 250 });
  };

  const goHome = async () => {
    await getMapController()?.resetExtent();
  };

  const setBasemap = async (style: string) => {
    const ctrl = getMapController();
    const map = ctrl?.webmap as { basemap?: unknown } | null | undefined;
    if (!map) return;
    try {
      const BasemapMod = await import("@arcgis/core/Basemap.js");
      const Basemap = (BasemapMod as { default: { fromId: (id: string) => unknown } }).default;
      map.basemap = Basemap.fromId(style);
      setActiveBasemap(style);
    } catch {
      /* ignore basemap swap errors */
    }
  };

  return (
    <div className="map-toolbar">
      <div className="map-toolbar-bar" role="toolbar" aria-label="Map controls">
        <button type="button" className="map-tool-btn" title="Zoom in" aria-label="Zoom in" onClick={() => void zoom("in")}>
          <calcite-icon icon="plus" scale="s" />
        </button>
        <button type="button" className="map-tool-btn" title="Zoom out" aria-label="Zoom out" onClick={() => void zoom("out")}>
          <calcite-icon icon="minus" scale="s" />
        </button>
        <button type="button" className="map-tool-btn" title="Default extent" aria-label="Home" onClick={() => void goHome()}>
          <calcite-icon icon="home" scale="s" />
        </button>
        <button
          type="button"
          className={`map-tool-btn${open === "legend" ? " is-open" : ""}`}
          title="Legend"
          aria-label="Legend"
          aria-expanded={open === "legend"}
          onClick={() => toggle("legend")}
        >
          <calcite-icon icon="legend" scale="s" />
        </button>
        <button
          type="button"
          className={`map-tool-btn${open === "basemap" ? " is-open" : ""}`}
          title="Basemap"
          aria-label="Basemap"
          aria-expanded={open === "basemap"}
          onClick={() => toggle("basemap")}
        >
          <calcite-icon icon="basemap" scale="s" />
        </button>
        {selectionName ? (
          <button
            type="button"
            className="map-tool-btn map-tool-btn--clear-selection"
            title={`Clear selection (${selectionName})`}
            aria-label="Clear selection"
            onClick={() => clearMapSelection()}
          >
            <calcite-icon icon="reset" scale="s" />
          </button>
        ) : null}
      </div>

      {open === "legend" ? (
        <div className="map-tool-panel" role="dialog" aria-label="Map legend">
          <header className="map-tool-panel-header">
            <strong>Legend</strong>
            <button type="button" className="text-btn" onClick={() => setOpen(null)}>
              Close
            </button>
          </header>
          <div className="map-tool-panel-body">
            {hasLegend ? (
              <LegendPanel />
            ) : (
              <p className="section-hint">
                Apply smart symbology to show a custom chart or boundary legend here.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {open === "basemap" ? (
        <div className="map-tool-panel map-tool-panel-basemap" role="dialog" aria-label="Basemap">
          <header className="map-tool-panel-header">
            <strong>Basemap</strong>
            <button type="button" className="text-btn" onClick={() => setOpen(null)}>
              Close
            </button>
          </header>
          <ul className="basemap-list">
            {BASEMAPS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={activeBasemap === item.style ? "basemap-item is-active" : "basemap-item"}
                  onClick={() => void setBasemap(item.style)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
