import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { INDICATOR_GROUPS } from "@/config/indicators";
import { ADMIN_LEVELS, getAdminLevel } from "@/config/layers";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";
import { AnalyticsMapPreview } from "@/components/analytics/analytics-map-preview";
import { RankingTable } from "@/components/analytics/ranking-table";
import { LocationFilters } from "@/components/filters/location-filters";
import { useAppStore } from "@/store/app-store";
import { useUiStore } from "@/store/ui-store";

/**
 * Indicator Analytics modal.
 * - Location filters match the main header (shared store).
 * - Analytics always follow map zoom (auto level).
 * - Map supports home / zoom / basemap and polygon selection that syncs analytics.
 */
export function AnalyticsWindow() {
  const open = useUiStore((s) => s.analyticsWindowOpen);
  const setOpen = useUiStore((s) => s.setAnalyticsWindowOpen);
  const analyticsGroup = useAppStore((s) => s.analyticsGroup);
  const setAnalyticsGroup = useAppStore((s) => s.setAnalyticsGroup);
  const selectionName = useAppStore((s) => s.selectionName);
  const selectionInfo = useAppStore((s) => s.selectionInfo);
  const filters = useAppStore((s) => s.filters);
  const currentLevel = useAppStore((s) => s.currentLevel());
  const setLevelMode = useAppStore((s) => s.setLevelMode);

  const displayInfo = useMemo(() => {
    if (selectionInfo) return selectionInfo;
    if (!selectionName) return null;
    const unitLabel = getAdminLevel(currentLevel).label;
    const ancestors: Array<{ label: string; value: string }> = [];
    for (const level of ADMIN_LEVELS) {
      if (level.id === currentLevel) break;
      const value = filters[level.id];
      if (value) ancestors.push({ label: level.label, value });
    }
    return { unitLabel, areaName: selectionName, ancestors };
  }, [selectionInfo, selectionName, currentLevel, filters]);

  useEffect(() => {
    if (!open) return;
    setLevelMode("auto");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, setOpen, setLevelMode]);

  if (!open) return null;

  const node = (
    <div className="analytics-modal-root" role="presentation">
      <button
        type="button"
        className="analytics-modal-backdrop"
        aria-label="Close Indicator Analytics"
        onClick={() => setOpen(false)}
      />
      <div
        className="analytics-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Indicator Analytics"
      >
        <header className="analytics-modal-header">
          <div className="panel-header-title">
            <calcite-icon icon="analysis" scale="s" />
            <h2>Indicator Analytics</h2>
          </div>
          <div className="header-filters-wrap">
            <LocationFilters variant="header" />
          </div>
          <div className="analytics-modal-tools">
            <button
              type="button"
              className="panel-close-btn"
              aria-label="Close"
              title="Close"
              onClick={() => setOpen(false)}
            >
              <calcite-icon icon="x" scale="s" />
            </button>
          </div>
        </header>

        <div className="analytics-modal-body">
          <div className="analytics-modal-left panel-scroll">
            {displayInfo ? (
              <div className="selection-summary" aria-label="Map selection">
                <h3 className="selection-summary-title">Selected Area</h3>
                <div className="selection-summary-row">
                  <span className="selection-summary-label">Administrative unit</span>
                  <strong className="selection-summary-value">{displayInfo.unitLabel}</strong>
                </div>
                <div className="selection-summary-row">
                  <span className="selection-summary-label">Selected area</span>
                  <strong className="selection-summary-value">{displayInfo.areaName}</strong>
                </div>
                {displayInfo.ancestors.length ? (
                  <div className="selection-summary-ancestors">
                    {displayInfo.ancestors.map((item) => (
                      <div key={item.label} className="selection-summary-row">
                        <span className="selection-summary-label">{item.label}</span>
                        <span className="selection-summary-value muted">{item.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="section-hint" style={{ marginTop: 0 }}>
                Analytics follow map zoom and filters. Click a polygon on the map to focus one area.
              </p>
            )}

            <section>
              <div className="section-head">
                <h2>Indicator group</h2>
              </div>
              <div className="chip-row wrap" role="group" aria-label="Indicator group">
                {INDICATOR_GROUPS.map((item) => {
                  const on = analyticsGroup === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={on ? "chip chip-active" : "chip"}
                      aria-pressed={on}
                      onClick={() => setAnalyticsGroup(item.id)}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <AnalyticsCharts />
            <RankingTable />
          </div>

          <div className="analytics-modal-right">
            <AnalyticsMapPreview />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
