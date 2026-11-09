/**
 * Runtime indicator catalog shared by Manage Data and Smart Symbology.
 * Persists to localStorage; mutates INDICATOR_GROUPS so labelForField / helpers stay in sync.
 */

import {
  INDICATOR_GROUPS,
  type IndicatorGroup,
} from "@/config/indicators";

export const CATALOG_KEY = "insight-hub-indicator-catalog-v1";
export const CATALOG_CHANGED_EVENT = "insight-hub-catalog-changed";

function cloneDefault(): IndicatorGroup[] {
  return INDICATOR_GROUPS.map((g) => ({
    ...g,
    fields: g.fields.map((f) => ({ ...f })),
  }));
}

/** Load catalog from localStorage, or defaults from config. */
export function loadIndicatorCatalog(): IndicatorGroup[] {
  if (typeof window === "undefined") return cloneDefault();
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (!raw) return cloneDefault();
    const parsed = JSON.parse(raw) as IndicatorGroup[];
    if (!Array.isArray(parsed) || !parsed.length) return cloneDefault();
    return parsed.map((g) => ({
      ...g,
      fields: Array.isArray(g.fields) ? g.fields.map((f) => ({ ...f })) : [],
    }));
  } catch {
    return cloneDefault();
  }
}

/** Persist catalog, sync static INDICATOR_GROUPS, notify listeners. */
export function saveIndicatorCatalog(groups: IndicatorGroup[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(groups));
  } catch {
    /* quota / private mode */
  }
  try {
    INDICATOR_GROUPS.length = 0;
    for (const g of groups) {
      INDICATOR_GROUPS.push({
        ...g,
        fields: g.fields.map((f) => ({ ...f })),
      });
    }
  } catch {
    /* frozen array in some builds */
  }
  try {
    window.dispatchEvent(new CustomEvent(CATALOG_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

/** Apply localStorage catalog onto INDICATOR_GROUPS at app startup. */
export function hydrateIndicatorCatalog(): void {
  if (typeof window === "undefined") return;
  const groups = loadIndicatorCatalog();
  try {
    INDICATOR_GROUPS.length = 0;
    for (const g of groups) {
      INDICATOR_GROUPS.push({
        ...g,
        fields: g.fields.map((f) => ({ ...f })),
      });
    }
  } catch {
    /* ignore */
  }
}
