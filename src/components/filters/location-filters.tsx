/**
 * Location filters with unified Date filter (replaces Year + Month dropdowns).
 * Drop in as src/components/filters/location-filters.tsx
 *
 * Requires:
 *  - setDateFilter on app-store
 *  - crimeFilters.dateFilter (DateFilterState)
 *  - DateFilterControl + date-filter.css
 */
import { useEffect, useRef, useState } from "react";
import { ADMIN_LEVELS, type AdminLevelId } from "@/config/layers";
import { useAppStore } from "@/store/app-store";
import { DateFilterControl } from "@/components/filters/date-filter-panel";
import { emptyDateFilter } from "@/lib/gis/date-filter";

type LocationFiltersProps = {
  variant?: "header" | "panel";
};

type CrimeFilterKey = "unit";

export function LocationFilters({ variant = "panel" }: LocationFiltersProps) {
  const filters = useAppStore((s) => s.filters);
  const options = useAppStore((s) => s.filterOptions);
  const crimeFilters = useAppStore((s) => s.crimeFilters);
  const crimeFilterOptions = useAppStore((s) => s.crimeFilterOptions);
  const setFilter = useAppStore((s) => s.setFilter);
  const setCrimeFilter = useAppStore((s) => s.setCrimeFilter);
  const setDateFilter = useAppStore((s) => s.setDateFilter);
  const clearFilters = useAppStore((s) => s.clearFilters);
  const mapReady = useAppStore((s) => s.mapReady);
  const [openId, setOpenId] = useState<AdminLevelId | CrimeFilterKey | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const dateFilter = crimeFilters.dateFilter ?? emptyDateFilter();

  useEffect(() => {
    if (!openId) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  const hasLocationFilter = Object.values(filters).some(Boolean);
  const hasDate =
    Boolean(dateFilter && dateFilter.mode && dateFilter.mode !== "all") ||
    Boolean(crimeFilters.year || crimeFilters.month);
  const hasCrimeFilter = Boolean(crimeFilters.unit || hasDate);
  const hasFilter = hasLocationFilter || hasCrimeFilter;

  const selectValue = (levelId: AdminLevelId, name: string | null) => {
    void setFilter(levelId, name);
    setOpenId(null);
  };

  const selectCrime = (key: CrimeFilterKey, name: string | null) => {
    void setCrimeFilter(key, name);
    setOpenId(null);
  };

  const divisionReady = mapReady;
  const unitReady = mapReady && Boolean(filters.division);
  const districtReady = mapReady && Boolean(crimeFilters.unit);
  const upazilaReady = mapReady && Boolean(filters.district);
  const unionReady = mapReady && Boolean(filters.upazila);

  const renderAdminDd = (
    level: (typeof ADMIN_LEVELS)[number],
    enabled: boolean,
    needLabel: string,
  ) => {
    const value = filters[level.id] ?? "";
    const list = options[level.id] ?? [];
    const isOpen = openId === level.id;
    const isActive = Boolean(value);
    const allLabel =
      level.id === "division"
        ? "All divisions"
        : enabled
          ? `All ${level.label.toLowerCase()}s`
          : needLabel;

    return (
      <div
        key={level.id}
        className={`header-filter-dd${isOpen ? " is-open" : ""}${isActive ? " is-active" : ""}`}
      >
        <button
          type="button"
          className="header-filter-dd-btn"
          disabled={!enabled}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          title={isActive ? value : level.label}
          onClick={(e) => {
            e.stopPropagation();
            if (!enabled) return;
            setOpenId((cur) => (cur === level.id ? null : level.id));
          }}
        >
          <span className="header-filter-dd-label">{level.label}</span>
          {isActive ? (
            <span className="header-filter-dot" aria-label={`Selected: ${value}`} />
          ) : null}
          <calcite-icon icon={isOpen ? "chevron-up" : "chevron-down"} scale="s" />
        </button>
        {isOpen ? (
          <ul
            className="header-filter-dd-menu"
            role="listbox"
            aria-label={level.label}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <li role="option" aria-selected={!value}>
              <button
                type="button"
                className={`header-filter-dd-option${!value ? " is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  selectValue(level.id as AdminLevelId, null);
                }}
              >
                {allLabel}
              </button>
            </li>
            {list.map((name) => (
              <li key={name} role="option" aria-selected={value === name}>
                <button
                  type="button"
                  className={`header-filter-dd-option${value === name ? " is-active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectValue(level.id as AdminLevelId, name);
                  }}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  const renderUnitDd = () => {
    const value = crimeFilters.unit ?? "";
    const list = crimeFilterOptions.units ?? [];
    const isOpen = openId === "unit";
    const isActive = Boolean(value);
    const enabled = unitReady;
    return (
      <div
        className={`header-filter-dd${isOpen ? " is-open" : ""}${isActive ? " is-active" : ""}`}
      >
        <button
          type="button"
          className="header-filter-dd-btn"
          disabled={!enabled}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          title={isActive ? value : "Unit"}
          onClick={(e) => {
            e.stopPropagation();
            if (!enabled) return;
            setOpenId((cur) => (cur === "unit" ? null : "unit"));
          }}
        >
          <span className="header-filter-dd-label">Unit</span>
          {isActive ? (
            <span className="header-filter-dot" aria-label={`Selected: ${value}`} />
          ) : null}
          <calcite-icon icon={isOpen ? "chevron-up" : "chevron-down"} scale="s" />
        </button>
        {isOpen ? (
          <ul
            className="header-filter-dd-menu"
            role="listbox"
            aria-label="Unit"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <li role="option" aria-selected={!value}>
              <button
                type="button"
                className={`header-filter-dd-option${!value ? " is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  selectCrime("unit", null);
                }}
              >
                {enabled ? "All units" : "Select Division first"}
              </button>
            </li>
            {list.map((name) => (
              <li key={name} role="option" aria-selected={value === name}>
                <button
                  type="button"
                  className={`header-filter-dd-option${value === name ? " is-active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectCrime("unit", name);
                  }}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  const division = ADMIN_LEVELS.find((l) => l.id === "division")!;
  const district = ADMIN_LEVELS.find((l) => l.id === "district")!;
  const upazila = ADMIN_LEVELS.find((l) => l.id === "upazila")!;
  const union = ADMIN_LEVELS.find((l) => l.id === "union")!;

  const dateControl = (
    <DateFilterControl
      value={dateFilter}
      years={crimeFilterOptions.years ?? []}
      months={crimeFilterOptions.months ?? []}
      enabled={mapReady}
      onChange={(next) => {
        void setDateFilter(next);
      }}
      variant={variant === "header" ? "header" : "panel"}
    />
  );

  if (variant === "header") {
    return (
      <div className="header-filters" role="group" aria-label="Location filters" ref={rootRef}>
        {renderAdminDd(division, divisionReady, "All divisions")}
        {renderUnitDd()}
        {renderAdminDd(district, districtReady, "Select Unit first")}
        {renderAdminDd(upazila, upazilaReady, "Select District first")}
        {renderAdminDd(union, unionReady, "Select Upazila first")}
        {dateControl}
        {hasFilter ? (
          <button
            type="button"
            className="header-filter-clear"
            aria-label="Clear filters"
            title="Clear filters"
            onClick={(e) => {
              e.stopPropagation();
              void clearFilters();
              setOpenId(null);
            }}
          >
            <calcite-icon icon="reset" scale="s" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="filter-stack">
      <label className="field">
        <span className="field-label-bold">{division.label}</span>
        <select
          value={filters.division ?? ""}
          disabled={!divisionReady}
          onChange={(event) => {
            void setFilter("division", event.target.value || null);
          }}
        >
          <option value="">All divisions</option>
          {(options.division ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label-bold">Unit</span>
        <select
          value={crimeFilters.unit ?? ""}
          disabled={!unitReady}
          onChange={(event) => {
            void setCrimeFilter("unit", event.target.value || null);
          }}
        >
          <option value="">{unitReady ? "All units" : "Select Division first"}</option>
          {(crimeFilterOptions.units ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label-bold">{district.label}</span>
        <select
          value={filters.district ?? ""}
          disabled={!districtReady}
          onChange={(event) => {
            void setFilter("district", event.target.value || null);
          }}
        >
          <option value="">{districtReady ? "All districts" : "Select Unit first"}</option>
          {(options.district ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label-bold">{upazila.label}</span>
        <select
          value={filters.upazila ?? ""}
          disabled={!upazilaReady}
          onChange={(event) => {
            void setFilter("upazila", event.target.value || null);
          }}
        >
          <option value="">{upazilaReady ? "All upazilas" : "Select District first"}</option>
          {(options.upazila ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label-bold">{union.label}</span>
        <select
          value={filters.union ?? ""}
          disabled={!unionReady}
          onChange={(event) => {
            void setFilter("union", event.target.value || null);
          }}
        >
          <option value="">{unionReady ? "All unions" : "Select Upazila first"}</option>
          {(options.union ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      {dateControl}

      {hasFilter ? (
        <div className="clear-row">
          <button
            type="button"
            className="header-filter-clear"
            aria-label="Clear filters"
            title="Clear filters"
            onClick={() => void clearFilters()}
          >
            <calcite-icon icon="reset" scale="s" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
