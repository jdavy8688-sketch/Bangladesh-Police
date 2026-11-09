import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  INDICATOR_GROUPS,
  labelForField,
  type IndicatorField,
  type IndicatorGroup,
} from "@/config/indicators";
import {
  CATALOG_CHANGED_EVENT,
  loadIndicatorCatalog,
  saveIndicatorCatalog,
} from "@/lib/indicator-catalog";
import { ADMIN_LEVELS, type AdminLevelId } from "@/config/layers";
import { applyCsvUpdates, type UpdateMode } from "@/lib/data-update/apply-csv-updates";
import { addFieldToWebMapLayers } from "@/lib/data-update/add-layer-field";
import { parseCsvFile, type CsvTable } from "@/lib/data-update/csv";
import { isNumericField, type FieldInfo } from "@/lib/gis/fields";
import { getMapController } from "@/lib/gis/map-controller";
import { useAppStore } from "@/store/app-store";
import { useUiStore } from "@/store/ui-store";

type MainTab = "add" | "modify";
type ModifyTab = "add_field" | "modify_field" | "modify_group";

function formatUnknownError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (typeof o.details === "string" && o.details.trim()) return o.details;
    if (Array.isArray(o.details) && o.details.length) {
      return o.details.map(String).join(" · ");
    }
  }
  return "Update failed. Check the CSV headers, field selection, and that the feature service allows editing.";
}

// Catalog load/save: use shared helpers from @/lib/indicator-catalog only.
// Do NOT redefine local load/save — that shadowed the imports, broke CATALOG_KEY,
// and caused deleted fields to reappear after refresh.

const SYSTEM_FIELD_RE =
  /^(objectid|fid|globalid|shape|shape_|created_|edited_|last_edited|creationdate|creator|editor|editdate)/i;

const SCALE_OR_REL_FIELD_RE = /_?s_?100$/i;

const NON_NUMERIC_TYPE_RE =
  /string|date|guid|global|blob|geometry|raster|xml|oid|objectid/i;

function isCandidateNumericField(f: { name?: string; alias?: string; type?: string }): boolean {
  const type = String(f.type ?? "").trim();
  if (!type) return true;
  if (NON_NUMERIC_TYPE_RE.test(type) && !/integer|double|single|float|long|short|number/i.test(type)) {
    return false;
  }
  const info: FieldInfo = { name: f.name || "", alias: f.alias || f.name || "", type };
  if (isNumericField(info)) return true;
  return /integer|double|single|float|long|short|number|count|oid/i.test(type);
}

function collectUndefinedFields(catalog: IndicatorGroup[]): IndicatorField[] {
  const map = getMapController();
  if (!map) return [];
  const assigned = new Set<string>();
  for (const g of catalog) {
    for (const f of g.fields) {
      assigned.add(f.id.toLowerCase());
      const base = f.id.replace(/_?s_?100$/i, "");
      if (base) assigned.add(base.toLowerCase());
    }
  }
  for (const level of ADMIN_LEVELS) {
    assigned.add(level.nameField.toLowerCase());
    assigned.add(level.codeField.toLowerCase());
    if (level.parentNameField) assigned.add(level.parentNameField.toLowerCase());
  }
  const byName = new Map<string, IndicatorField>();
  for (const layer of map.featureLayers()) {
    for (const f of layer.fields ?? []) {
      const name = (f.name || "").trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (assigned.has(lower)) continue;
      if (SYSTEM_FIELD_RE.test(name)) continue;
      if (SCALE_OR_REL_FIELD_RE.test(name)) continue;
      const baseName = name.replace(/_?s_?100$/i, "");
      if (baseName && baseName.toLowerCase() !== lower && assigned.has(baseName.toLowerCase())) continue;
      if (!isCandidateNumericField(f)) continue;
      if (byName.has(lower)) continue;
      const label = (f.alias || name).replace(/_/g, " ").trim() || name;
      byName.set(lower, { id: name, label });
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function DataUpdateWindow() {
  const open = useUiStore((s) => s.dataUpdateWindowOpen);
  const setOpen = useUiStore((s) => s.setDataUpdateWindowOpen);
  const mapReady = useAppStore((s) => s.mapReady);
  const showToast = useAppStore((s) => s.showToast);
  const refreshAnalytics = useAppStore((s) => s.refreshAnalytics);

  const [mainTab, setMainTab] = useState<MainTab>("add");
  const [modifyTab, setModifyTab] = useState<ModifyTab>("add_field");
  const [catalog, setCatalog] = useState<IndicatorGroup[]>(() =>
    typeof window !== "undefined" ? loadIndicatorCatalog() : INDICATOR_GROUPS,
  );

  /** Join always uses Union / Ward level (not user-selectable). */
  const [levelId] = useState<AdminLevelId>("union");
  const [browseGroupId, setBrowseGroupId] = useState<string>(INDICATOR_GROUPS[0]?.id ?? "");
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [mode, setMode] = useState<UpdateMode>("append");
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<CsvTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileInfo, setFileInfo] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newGroupId, setNewGroupId] = useState("");
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [editGroupId, setEditGroupId] = useState<string>(catalog[0]?.id ?? "");
  const [addFieldName, setAddFieldName] = useState("");
  const [addFieldLabel, setAddFieldLabel] = useState("");
  const [addFieldGroupId, setAddFieldGroupId] = useState(catalog[0]?.id ?? "");
  const [addFieldType, setAddFieldType] = useState("Double");

  const browseGroup = catalog.find((g) => g.id === browseGroupId) ?? catalog[0];
  const browseFields = browseGroup?.fields ?? [];
  const undefinedFields = useMemo(
    () => (mapReady ? collectUndefinedFields(catalog) : []),
    [catalog, mapReady],
  );
  const selectedFieldLabels = useMemo(() => fieldIds.map((id) => labelForField(id)), [fieldIds]);

  useEffect(() => {
    if (!open) return;
    setCatalog(loadIndicatorCatalog());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, setOpen, busy]);

  if (!open) return null;

  const persistCatalog = (next: IndicatorGroup[]) => {
    setCatalog(next);
    saveIndicatorCatalog(next);
  };
  const toggleField = (id: string) => {
    setFieldIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const removeField = (id: string) => {
    setFieldIds((prev) => prev.filter((x) => x !== id));
  };

  const onFile = async (file: File | null) => {
    setError(null);
    setResultMessage(null);
    setFileInfo(null);
    setTable(null);
    setFileName("");
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".txt")) {
      setError("Please upload a CSV file (export Excel as CSV).");
      return;
    }
    try {
      const parsed = await parseCsvFile(file);
      setTable(parsed);
      setFileName(file.name);
      setFileInfo(`${parsed.rows.length} row(s), ${parsed.headers.length} column(s).`);
    } catch (err) {
      setError(formatUnknownError(err));
    }
  };

  const runAddData = async () => {
    if (!table) {
      setError("Attach a CSV file first.");
      return;
    }
    if (!fieldIds.length) {
      setError("Select at least one indicator field.");
      return;
    }
    if (!mapReady) {
      setError("Wait until the web map finishes loading before running an update.");
      return;
    }
    setBusy(true);
    setError(null);
    setResultMessage(null);
    try {
      const result = await applyCsvUpdates({ levelId, fieldIds, mode, table });
      const msg =
        result.message ||
        `Update finished. Matched ${result.matched}, updated ${result.updated}, skipped ${result.skipped}.`;
      setResultMessage(msg);
      showToast({ kind: "success", message: msg });
      void refreshAnalytics();
    } catch (err) {
      const msg = formatUnknownError(err);
      setError(msg);
      showToast({ kind: "danger", message: msg });
    } finally {
      setBusy(false);
    }
  };

  const canRunAdd = mapReady && !busy && Boolean(table) && fieldIds.length > 0;

  const createGroup = () => {
    const id = newGroupId.trim() || newGroupLabel.trim().replace(/\s+/g, "_");
    const label = newGroupLabel.trim() || id;
    if (!id) {
      setError("Enter a group id or label.");
      return;
    }
    if (catalog.some((g) => g.id.toLowerCase() === id.toLowerCase())) {
      setError(`Group "${id}" already exists.`);
      return;
    }
    const next = [...catalog, { id, label, description: "", fields: [] as IndicatorField[] }];
    persistCatalog(next);
    setNewGroupId("");
    setNewGroupLabel("");
    setEditGroupId(id);
    setError(null);
    setResultMessage(`Indicator group "${label}" created.`);
  };

  const removeGroup = (id: string) => {
    if (catalog.length <= 1) {
      setError("Keep at least one indicator group.");
      return;
    }
    const next = catalog.filter((g) => g.id !== id);
    persistCatalog(next);
    if (editGroupId === id) setEditGroupId(next[0]?.id ?? "");
    setResultMessage(`Removed group "${id}".`);
    setError(null);
  };

  const addFieldToGroup = async () => {
    const fid = addFieldName.trim().replace(/\s+/g, "_");
    const flabel = (addFieldLabel.trim() || fid).trim();
    const gid = addFieldGroupId || editGroupId || catalog[0]?.id;
    if (!fid || !gid) {
      setError("Field name and target group are required.");
      return;
    }
    if (!mapReady) {
      setError("Wait until the web map finishes loading before adding a field.");
      return;
    }
    setBusy(true);
    setError(null);
    setResultMessage(null);
    try {
      const service = await addFieldToWebMapLayers({
        name: fid,
        alias: flabel || fid,
        type: addFieldType,
      });
      const next = catalog.map((g) => {
        if (g.id !== gid) return g;
        if (g.fields.some((f) => f.id.toLowerCase() === fid.toLowerCase())) return g;
        return { ...g, fields: [...g.fields, { id: fid, label: flabel || fid }] };
      });
      persistCatalog(next);
      setAddFieldName("");
      setAddFieldLabel("");
      if (service.failed.length && !service.created && !service.skipped) {
        setError(service.message);
      } else {
        setResultMessage(`Catalog: "${flabel}" in group "${gid}". Service: ${service.message}`);
      }
    } catch (err) {
      setError(formatUnknownError(err));
    } finally {
      setBusy(false);
    }
  };

  const moveField = (fieldId: string, fromGroup: string, toGroup: string) => {
    if (fromGroup === toGroup) return;
    let moved: IndicatorField | null = null;
    const next = catalog.map((g) => {
      if (g.id === fromGroup) {
        const f = g.fields.find((x) => x.id === fieldId);
        if (f) moved = f;
        return { ...g, fields: g.fields.filter((x) => x.id !== fieldId) };
      }
      return g;
    });
    if (!moved) return;
    const final = next.map((g) => {
      if (g.id !== toGroup) return g;
      if (g.fields.some((f) => f.id === fieldId)) return g;
      return { ...g, fields: [...g.fields, moved!] };
    });
    persistCatalog(final);
    setResultMessage(`Moved "${fieldId}" to "${toGroup}".`);
  };

  const removeFieldFromGroup = (groupId: string, fieldId: string) => {
    const next = catalog.map((g) =>
      g.id === groupId ? { ...g, fields: g.fields.filter((f) => f.id !== fieldId) } : g,
    );
    persistCatalog(next);
    setResultMessage(`Removed "${fieldId}" from "${groupId}".`);
  };

  const assignUndefinedField = (field: IndicatorField, toGroup: string) => {
    if (!toGroup) return;
    const next = catalog.map((g) => {
      if (g.id !== toGroup) return g;
      if (g.fields.some((x) => x.id.toLowerCase() === field.id.toLowerCase())) return g;
      return { ...g, fields: [...g.fields, field] };
    });
    persistCatalog(next);
    setResultMessage(`Assigned "${field.id}" to "${toGroup}".`);
    setError(null);
  };

  const node = (
    <div className="analytics-modal-root" role="presentation">
      <button
        type="button"
        className="analytics-modal-backdrop"
        aria-label="Close manage data"
        onClick={() => {
          if (!busy) setOpen(false);
        }}
      />
      <div className="data-update-modal" role="dialog" aria-modal="true" aria-label="Manage Data">
        <header className="analytics-modal-header">
          <div className="panel-header-title">
            <calcite-icon icon="table" scale="s" />
            <h2>Manage Data</h2>
          </div>
          <button
            type="button"
            className="panel-close-btn"
            aria-label="Close"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            <calcite-icon icon="x" scale="s" />
          </button>
        </header>

        <div className="data-update-body">
          <div className="data-update-maintabs" role="tablist" aria-label="Manage Data sections">
            <button
              type="button"
              className={mainTab === "add" ? "seg-btn seg-active" : "seg-btn"}
              role="tab"
              aria-selected={mainTab === "add"}
              onClick={() => setMainTab("add")}
            >
              <calcite-icon icon="upload" scale="s" />
              Add Data
            </button>
            <button
              type="button"
              className={mainTab === "modify" ? "seg-btn seg-active" : "seg-btn"}
              role="tab"
              aria-selected={mainTab === "modify"}
              onClick={() => setMainTab("modify")}
            >
              <calcite-icon icon="pencil" scale="s" />
              Modify Data
            </button>
          </div>

          {mainTab === "add" ? (
            <div className="data-update-scroll">
              <section>
                <div className="section-head">
                  <h2>Indicator group</h2>
                </div>
                <div className="chip-row wrap" role="group" aria-label="Indicator group">
                  {catalog.map((item) => {
                    const on = browseGroupId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={on ? "chip chip-active" : "chip"}
                        aria-pressed={on}
                        onClick={() => setBrowseGroupId(item.id)}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="section-head">
                  <h2>Fields in group</h2>
                  <span className="method-tag">{fieldIds.length} selected</span>
                </div>
                {browseFields.length ? (
                  <ul className="check-list data-update-fields-check" role="listbox" aria-multiselectable="true">
                    {browseFields.map((field) => {
                      const on = fieldIds.includes(field.id);
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
                ) : (
                  <p className="empty-note">No fields in this group.</p>
                )}
              </section>

              <section>
                <div className="section-head">
                  <h2>Selected fields</h2>
                </div>
                {fieldIds.length ? (
                  <div className="selected-fields-box" role="list" aria-label="Selected fields">
                    {fieldIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="selected-field-chip"
                        title={`Remove ${labelForField(id)}`}
                        onClick={() => removeField(id)}
                      >
                        {labelForField(id)}
                        <calcite-icon icon="x" scale="s" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-note">Select fields above.</p>
                )}
                {fieldIds.length ? (
                  <p className="section-hint">
                    {fieldIds.length} field{fieldIds.length === 1 ? "" : "s"}: {selectedFieldLabels.join(", ")}
                  </p>
                ) : null}
              </section>

              <section>
                <div className="section-head">
                  <h2>Update mode</h2>
                </div>
                <div className="seg">
                  <button
                    type="button"
                    className={mode === "append" ? "seg-btn seg-active" : "seg-btn"}
                    onClick={() => setMode("append")}
                  >
                    Append
                  </button>
                  <button
                    type="button"
                    className={mode === "replace" ? "seg-btn seg-active" : "seg-btn"}
                    onClick={() => setMode("replace")}
                  >
                    Replace
                  </button>
                </div>
                <p className="section-hint">
                  {mode === "append"
                    ? "Adds CSV values to existing attribute values for the selected fields."
                    : "Overwrites existing attribute values with CSV values for the selected fields."}
                </p>
              </section>

              <section>
                <div className="section-head">
                  <h2>CSV attachment</h2>
                </div>
                <label className="data-update-file">
                  <calcite-button appearance="outline" kind="neutral" scale="s" icon-start="attachment">
                    Choose CSV file...
                  </calcite-button>
                  <input
                    type="file"
                    accept=".csv,.txt,text/csv"
                    disabled={busy}
                    onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {fileName ? <p className="section-hint">{fileName}</p> : null}
                {fileInfo ? <p className="section-hint">{fileInfo}</p> : null}
              </section>

              {error ? (
                <div className="data-update-banner data-update-banner--danger" role="alert">
                  <strong>Error</strong>
                  <span>{error}</span>
                </div>
              ) : null}
              {resultMessage ? (
                <div className="data-update-banner data-update-banner--success" role="status">
                  <strong>Done</strong>
                  <span>{resultMessage}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="data-update-scroll">
              <div className="data-update-subtabs" role="tablist" aria-label="Modify Data sections">
                <button
                  type="button"
                  className={modifyTab === "add_field" ? "seg-btn seg-active" : "seg-btn"}
                  role="tab"
                  aria-selected={modifyTab === "add_field"}
                  onClick={() => setModifyTab("add_field")}
                >
                  <calcite-icon icon="plus" scale="s" />
                  Add Field
                </button>
                <button
                  type="button"
                  className={modifyTab === "modify_field" ? "seg-btn seg-active" : "seg-btn"}
                  role="tab"
                  aria-selected={modifyTab === "modify_field"}
                  onClick={() => setModifyTab("modify_field")}
                >
                  <calcite-icon icon="pencil" scale="s" />
                  Modify Field
                </button>
                <button
                  type="button"
                  className={modifyTab === "modify_group" ? "seg-btn seg-active" : "seg-btn"}
                  role="tab"
                  aria-selected={modifyTab === "modify_group"}
                  onClick={() => setModifyTab("modify_group")}
                >
                  <calcite-icon icon="layer" scale="s" />
                  Modify Group
                </button>
              </div>

              {modifyTab === "add_field" ? (
                <section className="data-update-card">
                  <div className="section-head">
                    <h2>Add field</h2>
                  </div>
                  <p className="section-hint" style={{ marginTop: 0 }}>
                    Creates the attribute column on all Boundary and Chart layers in the web map, and
                    registers it in the dashboard catalog. Requires edit privileges on the hosted
                    feature service. Then load values via Add Data.
                  </p>
                  <div className="data-update-form-grid">
                    <label className="data-update-field">
                      <span className="data-update-field-label">Field name</span>
                      <input
                        className="data-update-input"
                        value={addFieldName}
                        onChange={(e) => setAddFieldName(e.target.value)}
                        placeholder="e.g. New_Indicator"
                      />
                    </label>
                    <label className="data-update-field">
                      <span className="data-update-field-label">Label</span>
                      <input
                        className="data-update-input"
                        value={addFieldLabel}
                        onChange={(e) => setAddFieldLabel(e.target.value)}
                        placeholder="Display label"
                      />
                    </label>
                    <label className="data-update-field">
                      <span className="data-update-field-label">Group</span>
                      <select
                        className="data-update-input"
                        value={addFieldGroupId}
                        onChange={(e) => setAddFieldGroupId(e.target.value)}
                      >
                        {catalog.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="data-update-field">
                      <span className="data-update-field-label">Type</span>
                      <select
                        className="data-update-input"
                        value={addFieldType}
                        onChange={(e) => setAddFieldType(e.target.value)}
                      >
                        <option value="Double">Double</option>
                        <option value="Integer">Integer</option>
                        <option value="String">String</option>
                      </select>
                    </label>
                  </div>
                  <div className="data-update-form-actions">
                    <button
                      type="button"
                      className="data-update-run-btn"
                      disabled={busy}
                      onClick={() => void addFieldToGroup()}
                    >
                      {busy ? "Working…" : "Add field"}
                    </button>
                  </div>
                </section>
              ) : null}

              {modifyTab === "modify_field" ? (
                <section className="data-update-card data-update-card--flat">
                  <p className="section-hint" style={{ marginTop: 0 }}>
                    Move or remove fields between indicator groups. Undefined Fields lists numeric
                    attributes on the map that are not yet assigned to any group — pick a group to
                    register them. Changes apply to the dashboard catalog (Smart Symbology and
                    analytics). Click a group header to expand or collapse it.
                  </p>
                  {catalog.map((g) => (
                    <details key={g.id} className="data-update-group-block">
                      <summary className="section-head data-update-group-toggle">
                        <h2>{g.label}</h2>
                        <span className="method-tag">{g.fields.length}</span>
                      </summary>
                      {g.fields.length ? (
                        <ul className="data-update-field-list" role="list">
                          {g.fields.map((f) => (
                            <li key={f.id} className="data-update-field-row" role="listitem">
                              <span className="data-update-field-row-label">{f.label}</span>
                              <select
                                className="data-update-input data-update-input--sm"
                                value={g.id}
                                aria-label={`Move ${f.label} to group`}
                                onChange={(e) => moveField(f.id, g.id, e.target.value)}
                              >
                                {catalog.map((tg) => (
                                  <option key={tg.id} value={tg.id}>
                                    {tg.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="data-update-icon-btn"
                                title={`Remove ${f.label}`}
                                aria-label={`Remove ${f.label}`}
                                onClick={() => removeFieldFromGroup(g.id, f.id)}
                              >
                                <calcite-icon icon="trash" scale="s" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-note">No fields in this group.</p>
                      )}
                    </details>
                  ))}

                  <details className="data-update-group-block">
                    <summary className="section-head data-update-group-toggle">
                      <h2>Undefined fields</h2>
                      <span className="method-tag">{undefinedFields.length}</span>
                    </summary>
                    {undefinedFields.length ? (
                      <ul className="data-update-field-list" role="list">
                        {undefinedFields.map((f) => (
                          <li key={f.id} className="data-update-field-row" role="listitem">
                            <span className="data-update-field-row-label">{f.label}</span>
                            <select
                              className="data-update-input data-update-input--sm"
                              defaultValue=""
                              aria-label={`Assign ${f.label} to group`}
                              onChange={(e) => {
                                if (e.target.value) assignUndefinedField(f, e.target.value);
                              }}
                            >
                              <option value="">Assign to group…</option>
                              {catalog.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.label}
                                </option>
                              ))}
                            </select>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty-note">No unassigned numeric fields on the map layers.</p>
                    )}
                  </details>
                </section>
              ) : null}

              {modifyTab === "modify_group" ? (
                <section className="data-update-card">
                  <p className="section-hint" style={{ marginTop: 0 }}>
                    Create a new indicator group or remove an existing one. Groups appear in Smart
                    Symbology and analytics field pickers.
                  </p>
                  <div className="data-update-form-grid">
                    <label className="data-update-field">
                      <span className="data-update-field-label">New group id</span>
                      <input
                        className="data-update-input"
                        value={newGroupId}
                        onChange={(e) => setNewGroupId(e.target.value)}
                        placeholder="e.g. custom_group"
                        autoComplete="off"
                      />
                    </label>
                    <label className="data-update-field">
                      <span className="data-update-field-label">Label</span>
                      <input
                        className="data-update-input"
                        value={newGroupLabel}
                        onChange={(e) => setNewGroupLabel(e.target.value)}
                        placeholder="Display label"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                  <div className="data-update-form-actions">
                    <button type="button" className="data-update-run-btn" onClick={createGroup}>
                      Create group
                    </button>
                  </div>

                  <div className="section-head" style={{ marginTop: "1rem" }}>
                    <h2>Existing groups</h2>
                    <span className="method-tag">{catalog.length}</span>
                  </div>
                  <ul className="data-update-group-list" role="list">
                    {catalog.map((g) => (
                      <li key={g.id} className="data-update-group-item" role="listitem">
                        <div className="data-update-group-item-main">
                          <span className="data-update-group-item-label">{g.label}</span>
                          <span
                            className="method-tag data-update-group-count"
                            aria-label={`${g.fields.length} fields`}
                          >
                            {`${g.fields.length} field${g.fields.length === 1 ? "" : "s"}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="data-update-icon-btn"
                          title={`Remove group ${g.label}`}
                          aria-label={`Remove group ${g.label}`}
                          onClick={() => removeGroup(g.id)}
                        >
                          <calcite-icon icon="trash" scale="s" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {error ? (
                <div className="data-update-banner data-update-banner--danger" role="alert">
                  <strong>Error</strong>
                  <span>{error}</span>
                </div>
              ) : null}
              {resultMessage ? (
                <div className="data-update-banner data-update-banner--success" role="status">
                  <strong>Done</strong>
                  <span>{resultMessage}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <footer className="data-update-footer">
          <div className="data-update-result" aria-live="polite">
            {busy ? (
              <div className="data-update-banner data-update-banner--info" role="status">
                <strong>Running…</strong>
                <span>Matching features and writing attributes. Please wait.</span>
              </div>
            ) : null}
          </div>
          <div className="data-update-actions">
            {mainTab === "add" ? (
              <button
                type="button"
                className="data-update-run-btn"
                disabled={!canRunAdd}
                onClick={() => void runAddData()}
              >
                {busy ? "Running…" : "Run Add Data"}
              </button>
            ) : (
              <button type="button" className="data-update-run-btn" disabled>
                Run Modify Data
              </button>
            )}
            <button
              type="button"
              className="data-update-cancel-btn"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
