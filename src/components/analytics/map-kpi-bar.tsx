import { useMemo } from "react";
import { formatNumber } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

/**
 * Top crime KPI cards from Crime_Data (Unit × year × month).
 * Icons: @esri/calcite-ui-icons (kebab-case).
 */
const CRIME_KPI_CARDS: Array<{
  id: string;
  label: string;
  icon: string;
  insight: string;
  tone: "red" | "green" | "blue" | "yellow";
}> = [
  {
    id: "total_cases",
    label: "Total Cases",
    icon: "file-text",
    insight: "All reported crime cases",
    tone: "red",
  },
  {
    id: "murder",
    label: "Murder",
    icon: "exclamation-mark-triangle",
    insight: "Homicide cases",
    tone: "red",
  },
  {
    id: "robbery",
    label: "Robbery",
    icon: "user",
    insight: "Robbery cases",
    tone: "yellow",
  },
  {
    id: "dacoity",
    label: "Dacoity",
    icon: "group",
    insight: "Dacoity cases",
    tone: "blue",
  },
  {
    id: "theft",
    label: "Theft",
    icon: "shopping-cart",
    insight: "Theft cases",
    tone: "green",
  },
];

/**
 * KPI cards above the map — top crimes from Crime_Data, ordered highest → lowest.
 */
export function MapKpiBar() {
  const kpis = useAppStore((s) => s.mapIncidentKpis);
  const loading = useAppStore((s) => s.analyticsLoading);

  const cards = useMemo(() => {
    const list = kpis ?? [];
    const withValues = CRIME_KPI_CARDS.map((meta) => {
      const match = list.find(
        (k) => k.id === meta.id || k.id.toLowerCase() === meta.id.toLowerCase(),
      );
      return {
        ...meta,
        value: match?.value ?? null,
      };
    });
    // Rank by value descending (null / missing last)
    return [...withValues].sort((a, b) => {
      const av = a.value == null || !Number.isFinite(a.value) ? -1 : Number(a.value);
      const bv = b.value == null || !Number.isFinite(b.value) ? -1 : Number(b.value);
      return bv - av;
    });
  }, [kpis]);

  return (
    <div className="map-kpi-bar">
      <div className="map-kpi-scroll">
        {cards.map((card) => (
          <article
            key={card.id}
            className={`map-kpi-card map-kpi-card--${card.tone}`}
          >
            <div className="map-kpi-card-head">
              <span className="map-kpi-card-icon" aria-hidden>
                <calcite-icon icon={card.icon} scale="l" />
              </span>
              <p className="map-kpi-card-label">{card.label}</p>
            </div>
            <strong className="map-kpi-card-value tabular-nums">
              {loading && card.value == null ? "…" : formatNumber(card.value)}
            </strong>
            <p className="map-kpi-card-insight">{card.insight}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
