import { INDICATOR_GROUPS } from "@/config/indicators";
import { formatFull, formatNumber } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { getAdminLevel } from "@/config/layers";

export function RankingTable() {
  const ranking = useAppStore((s) => s.ranking);
  const rankingColumns = useAppStore((s) => s.rankingColumns);
  const groupId = useAppStore((s) => s.analyticsGroup);
  const level = useAppStore((s) => s.currentLevel());
  const featureCount = useAppStore((s) => s.featureCount);
  const loading = useAppStore((s) => s.analyticsLoading);
  const zoomToName = useAppStore((s) => s.zoomToName);
  const clearRankingSelection = useAppStore((s) => s.clearRankingSelection);
  const setRankingColumn = useAppStore((s) => s.setRankingColumn);

  const group = INDICATOR_GROUPS.find((g) => g.id === groupId);
  const columns =
    rankingColumns.length > 0
      ? rankingColumns
      : (group?.fields ?? []).slice(0, 3).map((f) => f.id);
  const admin = getAdminLevel(level);
  const primary = columns[0];

  function optionsForColumn(index: number) {
    const usedElsewhere = new Set(columns.filter((_, i) => i !== index));
    return INDICATOR_GROUPS.map((g) => ({
      group: g,
      fields: g.fields.filter((f) => f.id === columns[index] || !usedElsewhere.has(f.id)),
    })).filter((entry) => entry.fields.length > 0);
  }

  return (
    <section className="ranking-block">
      <div className="section-head">
        <h2>
          {admin.label} ranking
          <span>
            {loading ? "Updating…" : `Top ${ranking.length} of ${formatNumber(featureCount)}`}
          </span>
        </h2>
        <button
          type="button"
          className="clear-icon-btn"
          aria-label="Clear selection"
          title="Clear selection"
          onClick={() => clearRankingSelection()}
        >
          <calcite-icon icon="x" scale="s" />
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{admin.label}</th>
              {columns.map((colId, index) => (
                <th key={`${colId}-${index}`} className="num ranking-col-filter">
                  <label className="ranking-col-label">
                    <span className="sr-only">Column {index + 1}</span>
                    <select
                      value={colId}
                      aria-label={`Ranking column ${index + 1}${index === 0 ? " (sort)" : ""}`}
                      onChange={(event) => setRankingColumn(index, event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {optionsForColumn(index).map(({ group: g, fields }) => (
                        <optgroup key={g.id} label={g.label}>
                          {fields.map((field) => (
                            <option key={field.id} value={field.id}>
                              {field.label}
                              {index === 0 ? " ↓" : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranking.map((row, index) => (
              <tr key={row.name} onClick={() => void zoomToName(row.name)}>
                <td className="tabular-nums muted">{index + 1}</td>
                <td>{row.name}</td>
                {columns.map((colId) => {
                  const value = row.columns?.[colId] ?? (colId === primary ? row.value : 0);
                  return (
                    <td key={colId} className="num tabular-nums" title={formatFull(value)}>
                      {formatNumber(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!ranking.length && !loading ? (
              <tr>
                <td colSpan={2 + columns.length} className="empty-note">
                  No {admin.label.toLowerCase()} records in the current filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
