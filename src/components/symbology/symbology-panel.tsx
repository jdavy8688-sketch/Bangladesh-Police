import { useEffect, useRef, useState } from "react";
import { allIndicatorFields, fieldsForGroups, labelForField } from "@/config/indicators";
import {
  CATALOG_CHANGED_EVENT,
  loadIndicatorCatalog,
} from "@/lib/indicator-catalog";
import { LAYER_GROUPS, type LayerGroupId } from "@/config/layers";
import { ColorSchemePicker } from "@/components/symbology/color-scheme-picker";
import { describeMethod, useAppStore } from "@/store/app-store";

declare global {
  interface Window {
    /** Scale option: when true, field resolution prefers *_S100 attributes (Boundary and Chart). */
    __symUseScale?: boolean;
  }
}

export function SymbologyPanel() {
  const group = useAppStore((s) => s.symLayerGroup);
  const browseGroup = useAppStore((s) => s.symBrowseGroup);
  const fields = useAppStore((s) => s.symFieldsByGroup[s.symLayerGroup] ?? []);
  const scheme = useAppStore((s) => s.symScheme);
  const sizeField = useAppStore((s) => s.symSizeField);
  const applying = useAppStore((s) => s.symApplying);
  const mapReady = useAppStore((s) => s.mapReady);
  const setGroup = useAppStore((s) => s.setSymLayerGroup);
  const setBrowseGroup = useAppStore((s) => s.setSymBrowseGroup);
  const toggleField = useAppStore((s) => s.toggleSymField);
  const removeField = useAppStore((s) => s.removeSymField);
  const setScheme = useAppStore((s) => s.setSymScheme);
  const setSizeField = useAppStore((s) => s.setSymSizeField);
  const apply = useAppStore((s) => s.applySymbology);
  const reset = useAppStore((s) => s.resetSymbology);

  /** Live catalog (respects Manage Data create/remove group). */
  const [catalog, setCatalog] = useState(() =>
    typeof window !== "undefined" ? loadIndicatorCatalog() : [],
  );

  useEffect(() => {
    const reload = () => setCatalog(loadIndicatorCatalog());
    reload();
    window.addEventListener(CATALOG_CHANGED_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(CATALOG_CHANGED_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  // If current browse group was removed, switch to first remaining group.
  useEffect(() => {
    if (!catalog.length) return;
    if (!browseGroup || !catalog.some((g) => g.id === browseGroup)) {
      setBrowseGroup(catalog[0]!.id);
    }
  }, [catalog, browseGroup, setBrowseGroup]);

  const [useScaleByGroup, setUseScaleByGroup] = useState<Record<LayerGroupId, boolean>>({
    boundary: false,
    chart: false,
  });
  const useScale = useScaleByGroup[group] ?? false;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  const browseFields =
    catalog.find((g) => g.id === browseGroup)?.fields ??
    (browseGroup ? fieldsForGroups([browseGroup]) : []);
  const method = describeMethod(group, fields.length);
  const sizeOptions = allIndicatorFields();

  useEffect(() => {
    setSettingsOpen(false);
  }, [group]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  const applyWithScale = async () => {
    window.__symUseScale = useScale;
    try {
      await apply();
    } finally {
      window.__symUseScale = false;
    }
  };

  return (
    <aside className="side-panel left-panel">
      <header className="panel-header">
        <div className="panel-header-title">
          <calcite-icon icon="classify-pixels" scale="s" />
          <h2>Smart Symbology</h2>
        </div>
        <button
          type="button"
          className="panel-close-btn"
          aria-label="Close Smart Symbology"
          title="Close"
          onClick={() => useAppStore.getState().setLeftOpen(false)}
        >
          <calcite-icon icon="x" scale="s" />
        </button>
      </header>

      <div className="panel-scroll">
        <section>
          <div className="section-head">
            <h2>Indicator group</h2>
            <div className="section-head-actions">
              <span className="method-tag">{fields.length} selected</span>
              <div className="field-settings" ref={settingsRef}>
                <button
                  type="button"
                  className={`field-settings-btn${settingsOpen || useScale ? " is-active" : ""}`}
                  title="Indicator field settings"
                  aria-label="Indicator field settings"
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen((open) => !open)}
                >
                  <calcite-icon icon="gear" scale="s" />
                </button>
                {settingsOpen ? (
                  <div className="field-settings-menu" role="dialog" aria-label="Indicator field settings">
                    <label className="field-settings-option">
                      <input
                        type="checkbox"
                        checked={useScale}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setUseScaleByGroup((prev) => ({
                            ...prev,
                            [group]: checked,
                          }));
                        }}
                      />
                      <span>
                        <strong>Scale</strong>
                      </span>
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="chip-row wrap">
            {catalog.map((item) => {
              const on = browseGroup === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={on ? "chip chip-active" : "chip"}
                  onClick={() => setBrowseGroup(item.id)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {fields.length > 0 ? (
            <div className="selected-fields-box" aria-label="Selected indicator fields">
              {fields.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="field-keyword"
                  title={`Remove ${labelForField(id)}`}
                  onClick={() => removeField(id)}
                >
                  <span>{labelForField(id)}</span>
                  <calcite-icon icon="x" scale="s" />
                </button>
              ))}
            </div>
          ) : null}

          {browseFields.length > 0 ? (
            <ul className="check-list" role="listbox" aria-multiselectable="true" aria-label="Indicator fields">
              {browseFields.map((field) => {
                const on = fields.includes(field.id);
                return (
                  <li key={field.id} role="option" aria-selected={on}>
                    <label className={`check-list-item${on ? " is-selected" : ""}`}>
                      <span className="check-list-box" aria-hidden="true">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleField(field.id)}
                        />
                        <span className="check-list-box-ui">
                          {on ? <calcite-icon icon="check" scale="s" /> : null}
                        </span>
                      </span>
                      <span className="check-list-item-label">{field.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : !browseGroup ? (
            <p className="empty-note">Choose an indicator group to list its fields.</p>
          ) : (
            <p className="empty-note">No fields in this group.</p>
          )}
        </section>
      </div>

      <div className="left-panel-footer">
        <ColorSchemePicker
          value={scheme}
          onChange={setScheme}
          mode={group === "chart" ? "chart" : "boundary"}
          fieldCount={fields.length}
        />

        {group === "chart" ? (
          <label className="field">
            <span>Chart size field (optional)</span>
            <select value={sizeField} onChange={(event) => setSizeField(event.target.value)}>
              <option value="">Sum of selected indicators</option>
              {sizeOptions.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <section>
          <div className="section-head">
            <h2>Layer group</h2>
          </div>
          <div className="seg">
            {LAYER_GROUPS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={group === item.id ? "seg-btn seg-active" : "seg-btn"}
                onClick={() => setGroup(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <div className="method-banner">
          <span>Symbology Style</span>
          <strong>
            {method}
            {useScale ? " · Scale" : ""}
          </strong>
        </div>

        <div className="action-row">
          <calcite-button
            width="full"
            kind="brand"
            scale="s"
            loading={applying || undefined}
            disabled={!mapReady || applying || undefined}
            onClick={() => void applyWithScale()}
          >
            Apply to map
          </calcite-button>
          <calcite-button
            appearance="outline"
            kind="neutral"
            scale="s"
            icon-start="reset"
            onClick={() => reset(group)}
          >
            Reset
          </calcite-button>
        </div>
      </div>
    </aside>
  );
}
