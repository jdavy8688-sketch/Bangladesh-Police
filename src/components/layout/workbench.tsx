import { useEffect } from "react";
import { AnalyticsWindow } from "@/components/analytics/analytics-window";
import { MapKpiBar } from "@/components/analytics/map-kpi-bar";
import { DataUpdateWindow } from "@/components/data-update/data-update-window";
import { AppHeader } from "@/components/layout/app-header";
import { RightPanel } from "@/components/layout/right-panel";
import { MapPane } from "@/components/map/map-pane";
import { SmartLegendPortal } from "@/components/map/smart-legend-portal";
import { SymbologyPanel } from "@/components/symbology/symbology-panel";
import { APP_CONFIG } from "@/config/app-config";
import { ensureCalcite } from "@/lib/calcite";
import { useAppStore } from "@/store/app-store";

export function Workbench() {
  const leftOpen = useAppStore((s) => s.leftOpen);
  const rightOpen = useAppStore((s) => s.rightOpen);
  const toast = useAppStore((s) => s.toast);
  const showToast = useAppStore((s) => s.showToast);
  const mapError = useAppStore((s) => s.mapError);
  const mapReady = useAppStore((s) => s.mapReady);
  const setLeftOpen = useAppStore((s) => s.setLeftOpen);
  const setRightOpen = useAppStore((s) => s.setRightOpen);

  useEffect(() => {
    window.APP_CONFIG = { ...APP_CONFIG, ...window.APP_CONFIG };
    void ensureCalcite();
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (toast.kind !== "danger") {
      showToast(null);
      return;
    }
    const id = window.setTimeout(() => showToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast, showToast]);

  return (
    <div
      className="workbench calcite-mode-light"
      data-left={leftOpen ? "open" : "closed"}
      data-right={rightOpen ? "open" : "closed"}
    >
      <AppHeader />
      <div className="workspace">
        {leftOpen ? <SymbologyPanel /> : null}
        <main className="map-stage">
          <MapKpiBar />
          <div className="map-stage-body">
            <div className="map-pane-wrap">
              <MapPane />
              {mapReady && !mapError ? <SmartLegendPortal /> : null}
              {!mapReady && !mapError ? (
                <div className="map-scrim">
                  <calcite-loader label="Loading web map" />
                  <p>Connecting to the administrative web map…</p>
                </div>
              ) : null}
              {mapError ? (
                <div className="map-scrim">
                  <calcite-notice kind="danger" open>
                    <div slot="title">Web map unavailable</div>
                    <div slot="message">{mapError}</div>
                  </calcite-notice>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mobile-fabs">
            {!leftOpen ? (
              <button type="button" className="fab" onClick={() => setLeftOpen(true)}>
                Smart Symbology
              </button>
            ) : null}
            {!rightOpen ? (
              <button type="button" className="fab" onClick={() => setRightOpen(true)}>
                Legends
              </button>
            ) : null}
          </div>
        </main>
        {rightOpen ? <RightPanel /> : null}
      </div>

      <AnalyticsWindow />
      <DataUpdateWindow />

      {toast && toast.kind === "danger" ? (
        <div className={`toast toast-${toast.kind}`} role="status">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
