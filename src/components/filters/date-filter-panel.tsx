/**
 * Date Range filter — ArcGIS Dashboard style (From / Until + calendar).
 * Styles are embedded so the UI works even if date-filter.css is not imported.
 * Crime_Data is year+month only; calendar dates map to year/month for filtering.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MONTH_ORDER } from "@/config/layers";
import {
  emptyDateFilter,
  monthIndex,
  type DateFilterState,
} from "@/lib/gis/date-filter";

type Props = {
  value: DateFilterState;
  years: string[];
  months: string[];
  enabled?: boolean;
  onChange: (next: DateFilterState) => void;
  variant?: "header" | "panel";
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtShort(y: number, m: number, d: number) {
  return `${m}/${d}/${y}`;
}

function fmtInput(y: number, m: number, d: number) {
  return `${pad2(m)}/${pad2(d)}/${y}`;
}

function parseInput(s: string): { y: number; m: number; d: number } | null {
  const t = s.trim();
  let m: RegExpMatchArray | null;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    const y = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { y, m: mo, d };
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { y, m: mo, d };
  }
  return null;
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

function stateToBounds(value: DateFilterState): {
  from: { y: number; m: number; d: number } | null;
  to: { y: number; m: number; d: number } | null;
} {
  if (!value || value.mode === "all") return { from: null, to: null };

  if (value.mode === "range" || value.mode === "from" || value.mode === "till") {
    const yf = Number(value.yearFrom ?? value.year);
    const yt = Number(value.yearTo ?? value.year);
    const mf = value.monthFrom
      ? monthIndex(value.monthFrom)
      : value.month
        ? monthIndex(value.month)
        : 1;
    const mt = value.monthTo
      ? monthIndex(value.monthTo)
      : value.month
        ? monthIndex(value.month)
        : 12;
    return {
      from:
        value.mode === "till"
          ? null
          : Number.isFinite(yf)
            ? { y: yf, m: mf || 1, d: 1 }
            : null,
      to:
        value.mode === "from"
          ? null
          : Number.isFinite(yt)
            ? { y: yt, m: mt || 12, d: daysInMonth(yt, mt || 12) }
            : null,
    };
  }

  if (value.mode === "exact" && value.year) {
    const y = Number(value.year);
    const m = value.month ? monthIndex(value.month) : 0;
    if (m) {
      return { from: { y, m, d: 1 }, to: { y, m, d: daysInMonth(y, m) } };
    }
    return { from: { y, m: 1, d: 1 }, to: { y, m: 12, d: 31 } };
  }

  return { from: null, to: null };
}

function boundsToFilter(
  from: { y: number; m: number; d: number } | null,
  to: { y: number; m: number; d: number } | null,
): DateFilterState {
  if (!from && !to) return emptyDateFilter();
  const monthName = (m: number) => MONTH_ORDER[m - 1] ?? "January";
  if (from && to) {
    return {
      ...emptyDateFilter(),
      mode: "range",
      yearFrom: String(from.y),
      monthFrom: monthName(from.m),
      yearTo: String(to.y),
      monthTo: monthName(to.m),
      year: null,
      month: null,
    };
  }
  if (from) {
    return {
      ...emptyDateFilter(),
      mode: "from",
      yearFrom: String(from.y),
      monthFrom: monthName(from.m),
      year: String(from.y),
      month: monthName(from.m),
    };
  }
  return {
    ...emptyDateFilter(),
    mode: "till",
    yearTo: String(to!.y),
    monthTo: monthName(to!.m),
    year: String(to!.y),
    month: monthName(to!.m),
  };
}

/** Embedded styles — do not depend on a separate CSS file. */
const EMBEDDED_CSS = `
.dr-root-menu {
  min-width: 300px !important;
  width: 300px;
  max-width: 94vw;
  padding: 0 !important;
  background: #ffffff !important;
  opacity: 1 !important;
  box-sizing: border-box;
  overflow: visible !important;
  left: auto !important;
  right: 0 !important;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.08);
  isolation: isolate;
}
.dr-summary-head {
  padding: 10px 12px 8px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  background: #ffffff !important;
}
.dr-summary-title {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #6a6a6a;
}
.dr-summary-value {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  font-weight: 600;
  color: #151515;
}
.dr-panel {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  background: #ffffff !important;
  opacity: 1 !important;
}
.dr-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dr-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #151515;
}
.dr-input {
  display: block;
  height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(0,0,0,0.22);
  border-radius: 2px;
  font-size: 13px;
  color: #151515;
  background: #fff;
  width: 100%;
  box-sizing: border-box;
}
.dr-input:focus,
.dr-input.is-focused {
  outline: none;
  border-color: #0079c1;
  box-shadow: 0 0 0 1px #0079c1;
}
.dr-cal-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
  margin-top: 2px;
}
.dr-cal-title {
  flex: 1;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #151515;
}
.dr-nav-btn {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  border-radius: 2px;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  color: #151515;
  padding: 0;
}
.dr-nav-btn:hover { background: #f0f0f0; }
.dr-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: #6a6a6a;
  padding: 4px 0 2px;
}
.dr-weekdays span {
  display: block;
  text-align: center;
}
.dr-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.dr-day {
  height: 32px;
  width: 100%;
  border: 0;
  border-radius: 50%;
  background: transparent;
  font-size: 12px;
  color: #151515;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.dr-day.is-empty {
  visibility: hidden;
  cursor: default;
  pointer-events: none;
}
.dr-day:hover:not(.is-empty):not(.is-disabled):not(.is-selected) {
  background: #f0f0f0;
}
.dr-day.is-in-range {
  background: rgba(0, 121, 193, 0.14);
  border-radius: 0;
}
.dr-day.is-selected {
  background: #0079c1;
  color: #fff;
  font-weight: 600;
  border-radius: 50%;
}
.dr-day.is-disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.dr-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 4px;
}
.dr-btn {
  height: 32px;
  border: 1px solid rgba(0,0,0,0.18);
  border-radius: 2px;
  background: #fff;
  font-size: 13px;
  font-weight: 600;
  color: #0079c1;
  cursor: pointer;
}
.dr-btn:hover {
  background: #f5f8fb;
  border-color: #0079c1;
}

.date-filter-dd {
  position: relative !important;
}
.date-filter-dd .header-filter-dd-menu.dr-root-menu,
.date-filter-dd .dr-root-menu {
  position: absolute !important;
  top: calc(100% + 4px) !important;
  left: auto !important;
  right: 0 !important;
  z-index: 50 !important;
}
`;

export function DateFilterControl({
  value,
  years,
  months: _months,
  enabled = true,
  onChange,
  variant = "header",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isActive = value.mode !== "all";

  const bounds = stateToBounds(value);
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [focus, setFocus] = useState<"from" | "to">("from");
  const [fromText, setFromText] = useState(
    bounds.from ? fmtInput(bounds.from.y, bounds.from.m, bounds.from.d) : "",
  );
  const [toText, setToText] = useState(
    bounds.to ? fmtInput(bounds.to.y, bounds.to.m, bounds.to.d) : "",
  );

  const dataYears = useMemo(() => {
    const nums = years.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    return nums.length ? nums : [new Date().getFullYear()];
  }, [years]);

  const minY = dataYears[0]!;
  const maxY = dataYears[dataYears.length - 1]!;

  const now = new Date();
  const [viewY, setViewY] = useState(() => bounds.to?.y ?? bounds.from?.y ?? maxY);
  const [viewM, setViewM] = useState(() => bounds.to?.m ?? bounds.from?.m ?? now.getMonth() + 1);

  useEffect(() => {
    const b = stateToBounds(value);
    setFrom(b.from);
    setTo(b.to);
    setFromText(b.from ? fmtInput(b.from.y, b.from.m, b.from.d) : "");
    setToText(b.to ? fmtInput(b.to.y, b.to.m, b.to.d) : "");
  }, [value.mode, value.yearFrom, value.yearTo, value.monthFrom, value.monthTo, value.year, value.month]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t || rootRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = (nextFrom: typeof from, nextTo: typeof to) => {
    onChange(boundsToFilter(nextFrom, nextTo));
  };

  const pickDay = (y: number, m: number, d: number) => {
    const picked = { y, m, d };
    if (focus === "from") {
      setFrom(picked);
      setFromText(fmtInput(y, m, d));
      let nextTo = to;
      if (to && y * 400 + m * 32 + d > to.y * 400 + to.m * 32 + to.d) {
        nextTo = null;
        setTo(null);
        setToText("");
      }
      setFocus("to");
      apply(picked, nextTo);
    } else {
      setTo(picked);
      setToText(fmtInput(y, m, d));
      let nextFrom = from;
      if (from && y * 400 + m * 32 + d < from.y * 400 + from.m * 32 + from.d) {
        nextFrom = picked;
        setFrom(picked);
        setFromText(fmtInput(y, m, d));
      }
      apply(nextFrom, picked);
    }
  };

  const shiftMonth = (delta: number) => {
    let m = viewM + delta;
    let y = viewY;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    setViewY(y);
    setViewM(m);
  };

  const summary =
    from && to
      ? `${fmtShort(from.y, from.m, from.d)} - ${fmtShort(to.y, to.m, to.d)}`
      : from
        ? `From ${fmtShort(from.y, from.m, from.d)}`
        : to
          ? `Until ${fmtShort(to.y, to.m, to.d)}`
          : "All periods";

  const firstDow = new Date(viewY, viewM - 1, 1).getDay();
  const dim = daysInMonth(viewY, viewM);
  const cells: Array<{ y: number; m: number; d: number } | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push({ y: viewY, m: viewM, d });
  while (cells.length % 7 !== 0) cells.push(null);

  const isSame = (
    a: { y: number; m: number; d: number } | null,
    y: number,
    m: number,
    d: number,
  ) => a != null && a.y === y && a.m === m && a.d === d;

  const inRange = (y: number, m: number, d: number) => {
    if (!from || !to) return false;
    const k = y * 400 + m * 32 + d;
    const a = from.y * 400 + from.m * 32 + from.d;
    const b = to.y * 400 + to.m * 32 + to.d;
    return k > Math.min(a, b) && k < Math.max(a, b);
  };

  const monthLabel = `${MONTH_ORDER[viewM - 1] ?? ""} ${viewY}`;

  const body = (
    <div className="dr-panel">
      <div className="dr-field">
        <label className="dr-label">From</label>
        <input
          className={`dr-input${focus === "from" ? " is-focused" : ""}`}
          value={fromText}
          placeholder="MM/DD/YYYY"
          onFocus={() => setFocus("from")}
          onChange={(e) => setFromText(e.target.value)}
          onBlur={() => {
            const p = parseInput(fromText);
            if (p) {
              setFrom(p);
              setFromText(fmtInput(p.y, p.m, p.d));
              setViewY(p.y);
              setViewM(p.m);
              apply(p, to);
            }
          }}
        />
      </div>

      <div className="dr-field">
        <label className="dr-label">Until</label>
        <input
          className={`dr-input${focus === "to" ? " is-focused" : ""}`}
          value={toText}
          placeholder="MM/DD/YYYY"
          onFocus={() => setFocus("to")}
          onChange={(e) => setToText(e.target.value)}
          onBlur={() => {
            const p = parseInput(toText);
            if (p) {
              setTo(p);
              setToText(fmtInput(p.y, p.m, p.d));
              setViewY(p.y);
              setViewM(p.m);
              apply(from, p);
            }
          }}
        />
      </div>

      <div className="dr-cal-nav">
        <button type="button" className="dr-nav-btn" onClick={() => shiftMonth(-12)} aria-label="Previous year">
          «
        </button>
        <button type="button" className="dr-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <span className="dr-cal-title">{monthLabel}</span>
        <button type="button" className="dr-nav-btn" onClick={() => shiftMonth(1)} aria-label="Next month">
          ›
        </button>
        <button type="button" className="dr-nav-btn" onClick={() => shiftMonth(12)} aria-label="Next year">
          »
        </button>
      </div>

      <div className="dr-weekdays">
        {WEEKDAYS.map((w, i) => (
          <span key={`${w}-${i}`}>{w}</span>
        ))}
      </div>

      <div className="dr-grid">
        {cells.map((cell, i) => {
          if (!cell) return <span key={`e-${i}`} className="dr-day is-empty" />;
          const { y, m, d } = cell;
          const selected = isSame(from, y, m, d) || isSame(to, y, m, d);
          const ranged = inRange(y, m, d);
          const disabled = y < minY || y > maxY;
          return (
            <button
              key={`${y}-${m}-${d}`}
              type="button"
              disabled={disabled}
              className={[
                "dr-day",
                selected ? "is-selected" : "",
                ranged ? "is-in-range" : "",
                disabled ? "is-disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => pickDay(y, m, d)}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div className="dr-actions">
        <button
          type="button"
          className="dr-btn"
          onClick={() => {
            setFrom(null);
            setTo(null);
            setFromText("");
            setToText("");
            onChange(emptyDateFilter());
          }}
        >
          Reset
        </button>
        <button
          type="button"
          className="dr-btn"
          onClick={() => {
            const t = {
              y: now.getFullYear(),
              m: now.getMonth() + 1,
              d: now.getDate(),
            };
            setTo(t);
            setToText(fmtInput(t.y, t.m, t.d));
            setViewY(t.y);
            setViewM(t.m);
            setFocus("to");
            apply(from, t);
          }}
        >
          Today
        </button>
      </div>
    </div>
  );

  const menu = (
    <>
      <style dangerouslySetInnerHTML={{ __html: EMBEDDED_CSS }} />
      <div className="dr-summary-head">
        <span className="dr-summary-title">Date Range</span>
        <span className="dr-summary-value">{summary}</span>
      </div>
      {body}
    </>
  );

  if (variant === "panel") {
    return (
      <div className="date-filter-panel-wrap" ref={rootRef}>
        <span className="field-label-bold">Date Range</span>
        <button
          type="button"
          className={`header-filter-dd-btn date-filter-trigger${isActive ? " is-active" : ""}`}
          disabled={!enabled}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="header-filter-dd-label">{summary}</span>
          {isActive ? <span className="header-filter-dot" /> : null}
          <calcite-icon icon={open ? "chevron-up" : "chevron-down"} scale="s" />
        </button>
        {open ? (
          <div
            className="header-filter-dd-menu dr-root-menu"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: "auto",
              right: 0,
              zIndex: 50,
            }}
          >
            {menu}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`header-filter-dd date-filter-dd${open ? " is-open" : ""}${isActive ? " is-active" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="header-filter-dd-btn"
        disabled={!enabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={summary}
        onClick={(e) => {
          e.stopPropagation();
          if (!enabled) return;
          setOpen((o) => !o);
        }}
      >
        <span className="header-filter-dd-label">Date</span>
        {isActive ? <span className="header-filter-dot" aria-label={summary} /> : null}
        <calcite-icon icon={open ? "chevron-up" : "chevron-down"} scale="s" />
      </button>
      {open ? (
        <div
          className="header-filter-dd-menu dr-root-menu"
          role="dialog"
          aria-label="Date Range"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: "auto",
            right: 0,
            zIndex: 50,
            background: "#ffffff",
            opacity: 1,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.08)",
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menu}
        </div>
      ) : null}
    </div>
  );
}
