import {
  ADMIN_LEVELS,
  ancestorsOf,
  type AdminLevel,
  type AdminLevelId,
  type LocationFilters,
} from "@/config/layers";
import { escapeSqlLiteral } from "@/lib/utils";

export function sqlEq(field: string, value: string): string {
  return `${field} = '${escapeSqlLiteral(value)}'`;
}

export function sqlLike(field: string, value: string): string {
  return `LOWER(${field}) LIKE '%${escapeSqlLiteral(value.toLowerCase())}%'`;
}

/**
 * Build a definition expression using only the admin fields that exist
 * at `level` (Division has adm1 only, Union has adm1–adm4).
 *
 * When `availableFields` is provided (layer schema names), any clause whose
 * field is not on the layer is skipped — prevents
 * "Field name 'adm2_en' does not exist" on Chart layers with partial attrs.
 */
export function whereForLevel(
  level: AdminLevel,
  filters: LocationFilters,
  availableFields?: string[] | null,
): string {
  const allow =
    availableFields && availableFields.length
      ? new Set(availableFields.map((f) => f.toLowerCase()))
      : null;
  const parts: string[] = [];
  for (const ancestor of ancestorsOf(level.id)) {
    const value = filters[ancestor.id];
    if (!value) continue;
    const field = ancestor.nameField;
    if (allow && !allow.has(field.toLowerCase())) continue;
    parts.push(sqlEq(field, value));
  }
  return parts.join(" AND ");
}

export function whereForLevelId(levelId: AdminLevelId, filters: LocationFilters): string {
  return whereForLevel(
    ADMIN_LEVELS.find((l) => l.id === levelId)!,
    filters,
  );
}

export function describeFilters(filters: LocationFilters): string {
  const parts: string[] = [];
  for (const level of ADMIN_LEVELS) {
    const value = filters[level.id];
    if (value) parts.push(`${level.label}: ${value}`);
  }
  return parts.join(" · ") || "Bangladesh";
}
