/**
 * Resolve catalog field ids against a live feature-layer schema.
 * Matching order: exact name (case-insensitive) → exact alias → alphanumeric-only
 * → plural/singular variants.
 *
 * When `window.__symUseScale` is true (set during Boundary or Chart Apply with Scale),
 * resolution prefers `{id}_S100` while keeping the same catalog labels in the UI.
 */

export type FieldInfo = {
  name: string;
  alias: string;
  type: string;
};

const NUMERIC_TYPES = new Set([
  "esriFieldTypeSmallInteger",
  "esriFieldTypeInteger",
  "esriFieldTypeSingle",
  "esriFieldTypeDouble",
  "esriFieldTypeBigInteger",
  "esriFieldTypeOID",
  "small-integer",
  "integer",
  "single",
  "double",
  "long",
  "big-integer",
  "oid",
]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Candidate forms for a catalog id (exact, plural, singular). */
function candidates(canonical: string): string[] {
  const forms = new Set<string>([canonical]);
  if (canonical.endsWith("s") && canonical.length > 1) {
    forms.add(canonical.slice(0, -1));
  } else {
    forms.add(`${canonical}s`);
  }
  return Array.from(forms);
}

function isScaleEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as Window & { __symUseScale?: boolean }).__symUseScale);
}

export function isNumericField(info: FieldInfo | undefined): boolean {
  if (!info) return false;
  return NUMERIC_TYPES.has(info.type);
}

export function schemaLookup(schema: FieldInfo[]): Map<string, FieldInfo> {
  const map = new Map<string, FieldInfo>();
  for (const field of schema) {
    map.set(field.name.toLowerCase(), field);
  }
  return map;
}

function resolveFieldCore(schema: FieldInfo[], canonical: string): FieldInfo | null {
  if (!canonical) return null;

  for (const form of candidates(canonical)) {
    const lower = form.toLowerCase();
    const compact = normalize(form);

    const byName = schema.find((f) => f.name.toLowerCase() === lower);
    if (byName) return byName;

    const byAlias = schema.find((f) => (f.alias || "").toLowerCase() === lower);
    if (byAlias) return byAlias;

    const byCompactName = schema.find((f) => normalize(f.name) === compact);
    if (byCompactName) return byCompactName;

    const byCompactAlias = schema.find((f) => normalize(f.alias || "") === compact);
    if (byCompactAlias) return byCompactAlias;
  }

  return null;
}

export function resolveField(schema: FieldInfo[], canonical: string): FieldInfo | null {
  if (!canonical) return null;

  // Scale mode (Smart Symbology → gear → Scale) for Boundary and Chart.
  // Prefer *_S100 attributes; labels in the UI remain the catalog names.
  if (isScaleEnabled() && !/_s100$/i.test(canonical)) {
    const scaled = resolveFieldCore(schema, `${canonical}_S100`);
    if (scaled) return scaled;
  }

  return resolveFieldCore(schema, canonical);
}

export function resolveFieldName(schema: FieldInfo[], canonical: string): string | null {
  return resolveField(schema, canonical)?.name ?? null;
}

export function fieldExists(schema: FieldInfo[], canonical: string): boolean {
  return resolveField(schema, canonical) != null;
}

export function toFieldInfoFromEsri(fields: Array<{ name: string; alias?: string; type: string }>): FieldInfo[] {
  return fields.map((field) => ({
    name: field.name,
    alias: field.alias || field.name,
    type: field.type,
  }));
}
