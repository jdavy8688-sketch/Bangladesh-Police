import { resolveField, type FieldInfo } from "@/lib/gis/fields";
import { labelForField } from "@/config/indicators";

/** Resolve catalog field ids for chart apply; when useScale, prefer field_S100. */
export function resolveSymFields(
  schema: FieldInfo[],
  fieldIds: string[],
  useScale: boolean,
): Array<{ id: string; name: string; label: string }> {
  return fieldIds
    .map((id) => {
      const lookup = useScale ? `${id}_S100` : id;
      const info = resolveField(schema, lookup);
      return info ? { id, name: info.name, label: labelForField(id) } : null;
    })
    .filter(Boolean) as Array<{ id: string; name: string; label: string }>;
}

export function resolveSymSizeField(
  schema: FieldInfo[],
  sizeFieldId: string,
  useScale: boolean,
): FieldInfo | null {
  if (!sizeFieldId) return null;
  const lookup = useScale ? `${sizeFieldId}_S100` : sizeFieldId;
  return resolveField(schema, lookup);
}
