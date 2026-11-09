/**
 * Date / period filter for Crime_Data (year + month fields).
 * Mirrors ArcGIS Dashboard date selector patterns: all, fixed, range,
 * till / from, relative (last N years|months), YTD, current year/month.
 */

import { MONTH_ORDER } from "@/config/layers";

export type DateFilterMode =
  | "all"
  | "exact" // one year, optional month
  | "range" // inclusive from → to
  | "till" // data start → to
  | "from" // from → data end
  | "last_years"
  | "last_months"
  | "ytd"
  | "current_year"
  | "current_month";

export type DateFilterState = {
  mode: DateFilterMode;
  /** Exact / anchor year (string, e.g. "2024") */
  year: string | null;
  /** Exact month name (e.g. "March") */
  month: string | null;
  yearFrom: string | null;
  monthFrom: string | null;
  yearTo: string | null;
  monthTo: string | null;
  /** For last_years / last_months */
  relativeN: number | null;
};

export function emptyDateFilter(): DateFilterState {
  return {
    mode: "all",
    year: null,
    month: null,
    yearFrom: null,
    monthFrom: null,
    yearTo: null,
    monthTo: null,
    relativeN: null,
  };
}

/** Month name → 1..12 */
export function monthIndex(name: string | null | undefined): number {
  if (!name) return 0;
  const i = MONTH_ORDER.findIndex((m) => m.toLowerCase() === String(name).trim().toLowerCase());
  return i >= 0 ? i + 1 : 0;
}

/** Comparable period key: year * 12 + month (1..12). month 0 → treat as full year bounds when needed. */
export function periodKey(year: string | number, month?: string | number | null): number {
  const y = Number(year);
  if (!Number.isFinite(y)) return 0;
  let m: number;
  if (month == null || month === "") {
    m = 0;
  } else if (typeof month === "number") {
    m = month;
  } else {
    m = monthIndex(month);
  }
  return y * 12 + (m > 0 ? m : 0);
}

export type DateFilterOptions = {
  years: string[];
  months: string[];
};

function latestYear(years: string[]): number {
  const nums = years.map(Number).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : new Date().getFullYear();
}

function earliestYear(years: string[]): number {
  const nums = years.map(Number).filter(Number.isFinite);
  return nums.length ? Math.min(...nums) : new Date().getFullYear();
}

/**
 * Resolve the inclusive [fromKey, toKey] period window for the current filter.
 * Keys use year*12+month (month 1–12). Returns null when mode is "all".
 */
export function resolvePeriodWindow(
  filter: DateFilterState,
  options: DateFilterOptions,
): { from: number; to: number } | null {
  const years = options.years?.length ? options.years : [];
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1; // 1..12
  const dataMaxY = years.length ? latestYear(years) : cy;
  const dataMinY = years.length ? earliestYear(years) : cy;
  // Cap "now" to data extent when data ends before calendar now
  const endY = Math.min(cy, dataMaxY);
  const endM = endY === cy ? cm : 12;

  switch (filter.mode) {
    case "all":
      return null;

    case "exact": {
      if (!filter.year) return null;
      const y = Number(filter.year);
      if (filter.month) {
        const m = monthIndex(filter.month);
        const k = y * 12 + m;
        return { from: k, to: k };
      }
      return { from: y * 12 + 1, to: y * 12 + 12 };
    }

    case "range": {
      const yf = Number(filter.yearFrom ?? filter.year);
      const yt = Number(filter.yearTo ?? filter.year);
      if (!Number.isFinite(yf) || !Number.isFinite(yt)) return null;
      const mf = filter.monthFrom ? monthIndex(filter.monthFrom) : 1;
      const mt = filter.monthTo ? monthIndex(filter.monthTo) : 12;
      let from = yf * 12 + mf;
      let to = yt * 12 + mt;
      if (from > to) [from, to] = [to, from];
      return { from, to };
    }

    case "till": {
      const yt = Number(filter.yearTo ?? filter.year);
      if (!Number.isFinite(yt)) return null;
      const mt = filter.monthTo
        ? monthIndex(filter.monthTo)
        : filter.month
          ? monthIndex(filter.month)
          : 12;
      return { from: dataMinY * 12 + 1, to: yt * 12 + mt };
    }

    case "from": {
      const yf = Number(filter.yearFrom ?? filter.year);
      if (!Number.isFinite(yf)) return null;
      const mf = filter.monthFrom
        ? monthIndex(filter.monthFrom)
        : filter.month
          ? monthIndex(filter.month)
          : 1;
      return { from: yf * 12 + mf, to: dataMaxY * 12 + 12 };
    }

    case "last_years": {
      const n = Math.max(1, Number(filter.relativeN) || 1);
      const to = endY * 12 + endM;
      const fromY = endY - n + 1;
      return { from: fromY * 12 + 1, to };
    }

    case "last_months": {
      const n = Math.max(1, Number(filter.relativeN) || 1);
      const to = endY * 12 + endM;
      const from = to - n + 1;
      return { from, to };
    }

    case "ytd": {
      return { from: endY * 12 + 1, to: endY * 12 + endM };
    }

    case "current_year": {
      return { from: endY * 12 + 1, to: endY * 12 + 12 };
    }

    case "current_month": {
      const k = endY * 12 + endM;
      return { from: k, to: k };
    }

    default:
      return null;
  }
}

/** True if a Crime_Data row (year + month) is inside the active date window. */
export function rowMatchesDateFilter(
  year: unknown,
  month: unknown,
  filter: DateFilterState,
  options: DateFilterOptions,
): boolean {
  if (!filter || filter.mode === "all") return true;
  const window = resolvePeriodWindow(filter, options);
  if (!window) return true;

  const y = Number(year);
  if (!Number.isFinite(y)) return false;
  let m = monthIndex(String(month ?? ""));
  if (!m) m = 1; // if month missing, treat as January for range tests
  const key = y * 12 + m;
  return key >= window.from && key <= window.to;
}

/** Short label for the Date chip (header). */
export function dateFilterLabel(filter: DateFilterState): string {
  switch (filter.mode) {
    case "all":
      return "All periods";
    case "exact":
      if (filter.year && filter.month) return `${filter.month} ${filter.year}`;
      if (filter.year) return String(filter.year);
      return "Exact period";
    case "range": {
      const a = [filter.monthFrom, filter.yearFrom].filter(Boolean).join(" ") || "…";
      const b = [filter.monthTo, filter.yearTo].filter(Boolean).join(" ") || "…";
      return `${a} → ${b}`;
    }
    case "till": {
      const b = [filter.monthTo || filter.month, filter.yearTo || filter.year]
        .filter(Boolean)
        .join(" ");
      return b ? `Until ${b}` : "Until…";
    }
    case "from": {
      const a = [filter.monthFrom || filter.month, filter.yearFrom || filter.year]
        .filter(Boolean)
        .join(" ");
      return a ? `From ${a}` : "From…";
    }
    case "last_years":
      return `Last ${filter.relativeN || 1} year(s)`;
    case "last_months":
      return `Last ${filter.relativeN || 1} month(s)`;
    case "ytd":
      return "Year to date";
    case "current_year":
      return "Current year";
    case "current_month":
      return "Current month";
    default:
      return "Date";
  }
}

/** Preset definitions shown in the Date filter panel. */
export const DATE_FILTER_PRESETS: Array<{
  mode: DateFilterMode;
  label: string;
  description: string;
  /** Needs year / month pickers */
  needsExact?: boolean;
  needsRange?: boolean;
  needsTill?: boolean;
  needsFrom?: boolean;
  needsRelativeN?: boolean;
  defaultN?: number;
}> = [
  { mode: "all", label: "All periods", description: "No date restriction" },
  { mode: "current_month", label: "Current month", description: "This calendar month" },
  { mode: "current_year", label: "Current year", description: "This calendar year" },
  { mode: "ytd", label: "Year to date", description: "Jan → current month of this year" },
  {
    mode: "last_months",
    label: "Last N months",
    description: "Rolling months ending now",
    needsRelativeN: true,
    defaultN: 12,
  },
  {
    mode: "last_years",
    label: "Last N years",
    description: "Rolling years ending now",
    needsRelativeN: true,
    defaultN: 3,
  },
  {
    mode: "exact",
    label: "Specific period",
    description: "One year, or one year + month",
    needsExact: true,
  },
  {
    mode: "range",
    label: "Custom range",
    description: "From period → to period (inclusive)",
    needsRange: true,
  },
  {
    mode: "till",
    label: "Until date",
    description: "From start of data through a period",
    needsTill: true,
  },
  {
    mode: "from",
    label: "From date",
    description: "From a period through end of data",
    needsFrom: true,
  },
];
