import { formatNumber } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

export function KpiStrip() {
  const kpis = useAppStore((s) => s.kpis);
  const loading = useAppStore((s) => s.analyticsLoading);

  return (
    <div className="kpi-grid">
      {kpis.map((kpi) => (
        <article key={kpi.id} className="kpi-card">
          <p>{kpi.label}</p>
          <strong className="tabular-nums">{loading && kpi.value == null ? "…" : formatNumber(kpi.value)}</strong>
        </article>
      ))}
    </div>
  );
}
