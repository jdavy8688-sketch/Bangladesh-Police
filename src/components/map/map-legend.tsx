import { useState } from "react";
import { LegendPanel } from "@/components/symbology/legend-panel";
import { useAppStore } from "@/store/app-store";

/**
 * Floating legend control stacked with the map zoom / home widgets (top-left).
 */
export function MapLegend() {
  const [open, setOpen] = useState(false);
  const applied = useAppStore((s) => s.applied);
  const hasLegend = Boolean(applied.boundary || applied.chart);

  return (
    <div className="map-legend-control">
      <button
        type="button"
        className={`map-legend-btn${open ? " is-open" : ""}`}
        title="Legend"
        aria-expanded={open}
        aria-label="Toggle legend"
        onClick={() => setOpen((v) => !v)}
      >
        <calcite-icon icon="legend" scale="s" />
      </button>

      {open ? (
        <div className="map-legend-panel" role="dialog" aria-label="Map legend">
          <header className="map-legend-header">
            <strong>Legend</strong>
            <button type="button" className="text-btn" onClick={() => setOpen(false)} aria-label="Close legend">
              Close
            </button>
          </header>
          <div className="map-legend-body">
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
    </div>
  );
}
