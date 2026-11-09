import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LegendPanel } from "@/components/symbology/legend-panel";
import { getMapController } from "@/lib/gis/map-controller";
import { useAppStore } from "@/store/app-store";

/**
 * Hybrid legend inside Expand:
 * - Custom LegendPanel for groups with smart symbology applied
 * - Esri Legend for remaining layers (e.g. default chart pies when only boundary applied)
 */
export function SmartLegendPortal() {
  const mapReady = useAppStore((s) => s.mapReady);
  const applied = useAppStore((s) => s.applied);
  const hasCustom = Boolean(applied.boundary || applied.chart);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!mapReady) {
      setHost(null);
      return;
    }
    const pick = () => {
      const node = getMapController()?.legendHost ?? null;
      setHost((prev) => (prev === node ? prev : node));
    };
    pick();
    const id = window.setInterval(pick, 400);
    return () => window.clearInterval(id);
  }, [mapReady]);

  // Keep Esri Legend filtered to layers without a custom smart legend.
  useEffect(() => {
    if (!mapReady) return;
    getMapController()?.syncLegendFilter({
      boundary: applied.boundary,
      chart: applied.chart,
    });
  }, [applied, mapReady]);

  useEffect(() => {
    if (!host) return;
    const onClick = () => window.setTimeout(() => setTick((t) => t + 1), 40);
    const root = host.closest(".esri-expand");
    root?.addEventListener("click", onClick);
    return () => root?.removeEventListener("click", onClick);
  }, [host]);

  const contentKey = useMemo(() => {
    const b = applied.boundary;
    const c = applied.chart;
    return [b?.method ?? "", c?.method ?? "", tick].join("|");
  }, [applied, tick]);

  if (!host || !hasCustom) return null;

  return createPortal(
    <div className="smart-legend-body" key={contentKey}>
      <LegendPanel />
    </div>,
    host,
  );
}
