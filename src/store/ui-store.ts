import { create } from "zustand";

const ANALYTICS_OPEN_KEY = "crime-dashboard-analytics-open";

function readAnalyticsOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(ANALYTICS_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAnalyticsOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (open) sessionStorage.setItem(ANALYTICS_OPEN_KEY, "1");
    else sessionStorage.removeItem(ANALYTICS_OPEN_KEY);
  } catch {
    /* private mode / blocked storage */
  }
}

type UiState = {
  analyticsWindowOpen: boolean;
  analyticsDocked: boolean;
  dataUpdateWindowOpen: boolean;
  setAnalyticsWindowOpen: (open: boolean) => void;
  setAnalyticsDocked: (docked: boolean) => void;
  setDataUpdateWindowOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  analyticsWindowOpen: readAnalyticsOpen(),
  analyticsDocked: false,
  dataUpdateWindowOpen: false,
  setAnalyticsWindowOpen: (open) => {
    writeAnalyticsOpen(open);
    set({ analyticsWindowOpen: open });
  },
  setAnalyticsDocked: (docked) => set({ analyticsDocked: docked }),
  setDataUpdateWindowOpen: (open) => set({ dataUpdateWindowOpen: open }),
}));
