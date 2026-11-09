import { LegendPanel } from "@/components/symbology/legend-panel";
import { useAppStore } from "@/store/app-store";
import { useUiStore } from "@/store/ui-store";

/**
 * Right side panel: applied legends and Indicator Analytics modal launcher.
 */
export function RightPanel() {
  const setRightOpen = useAppStore((s) => s.setRightOpen);
  const setAnalyticsWindowOpen = useUiStore((s) => s.setAnalyticsWindowOpen);

  return (
    <aside className="side-panel right-panel">
      <header className="panel-header">
        <div className="panel-header-title">
          <calcite-icon icon="legend" scale="s" />
          <h2>Legends</h2>
        </div>
        <button
          type="button"
          className="panel-close-btn"
          aria-label="Close Legends"
          title="Close"
          onClick={() => setRightOpen(false)}
        >
          <calcite-icon icon="x" scale="s" />
        </button>
      </header>

      <div className="panel-scroll">
        <LegendPanel />
      </div>

      <div className="right-panel-actions">
        <calcite-button
          width="full"
          kind="brand"
          scale="s"
          icon-start="analysis"
          onClick={() => setAnalyticsWindowOpen(true)}
        >
          Indicator Analytics
        </calcite-button>
      </div>
    </aside>
  );
}
