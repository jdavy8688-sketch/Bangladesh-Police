import { INDICATOR_GROUPS } from "@/config/indicators";
import { ADMIN_LEVELS } from "@/config/layers";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";
import { KpiStrip } from "@/components/analytics/kpi-strip";
import { RankingTable } from "@/components/analytics/ranking-table";
import { LocationFilters } from "@/components/filters/location-filters";
import { useAppStore } from "@/store/app-store";

export function AnalyticsPanel() {
  const levelMode = useAppStore((s) => s.levelMode);
  const manualLevel = useAppStore((s) => s.manualLevel);
  const setLevelMode = useAppStore((s) => s.setLevelMode);
  const setManualLevel = useAppStore((s) => s.setManualLevel);
  const zoomToLevel = useAppStore((s) => s.zoomToLevel);
  const analyticsGroup = useAppStore((s) => s.analyticsGroup);
  const setAnalyticsGroup = useAppStore((s) => s.setAnalyticsGroup);
  const current = useAppStore((s) => s.currentLevel());

  return (
    <aside className="side-panel left-panel">
      <header className="panel-header">
        <div className="panel-header-title">
          <calcite-icon icon="filter" scale="s" />
          <h2>Location Filter</h2>
        </div>
        <button
          type="button"
          className="panel-close-btn"
          aria-label="Close Analytics"
          title="Close"
          onClick={() => useAppStore.getState().setLeftOpen(false)}
        >
          <calcite-icon icon="x" scale="s" />
        </button>
      </header>

      <div className="panel-scroll">
        <LocationFilters />

        <div className="panel-brand">
          <calcite-icon icon="analysis" scale="s" />
          <h2>Indicator Analysis</h2>
        </div>

        <section className="level-block">
          <div className="section-head">
            <h2>Administrative level</h2>
            <label className="switch-lab">
              <input
                type="checkbox"
                checked={levelMode === "auto"}
                onChange={(event) => setLevelMode(event.target.checked ? "auto" : "manual")}
              />
              Follow map zoom
            </label>
          </div>
          <div className="chip-row">
            {ADMIN_LEVELS.map((level) => {
              const active = current === level.id;
              return (
                <button
                  key={level.id}
                  type="button"
                  className={active ? "chip chip-active" : "chip"}
                  onClick={() => setManualLevel(level.id)}
                >
                  {level.shortLabel}
                </button>
              );
            })}
          </div>
          {levelMode === "manual" ? (
            <button
              type="button"
              className="text-btn"
              onClick={() => void zoomToLevel(manualLevel)}
            >
              View {ADMIN_LEVELS.find((l) => l.id === manualLevel)?.label} on the map
            </button>
          ) : null}
        </section>

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

        <KpiStrip />
        <AnalyticsCharts />
        <RankingTable />
      </div>
    </aside>
  );
}
