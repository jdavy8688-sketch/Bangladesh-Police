import type { SelectionInfo } from "@/store/app-store";

/** Build hierarchical selection labels from feature attributes (adm1–adm4). */
export function buildSelectionInfo(attrs: Record<string, unknown>): SelectionInfo {
  const division = attrs.adm1_en != null ? String(attrs.adm1_en).trim() : "";
  const district = attrs.adm2_en != null ? String(attrs.adm2_en).trim() : "";
  const upazila = attrs.adm3_en != null ? String(attrs.adm3_en).trim() : "";
  const union = attrs.adm4_en != null ? String(attrs.adm4_en).trim() : "";

  if (union) {
    const ancestors = [];
    if (division) ancestors.push({ label: "Division", value: division });
    if (district) ancestors.push({ label: "District", value: district });
    if (upazila) ancestors.push({ label: "Upazila", value: upazila });
    return { unitLabel: "Union / Ward", areaName: union, ancestors };
  }
  if (upazila) {
    const ancestors = [];
    if (division) ancestors.push({ label: "Division", value: division });
    if (district) ancestors.push({ label: "District", value: district });
    return { unitLabel: "Upazila", areaName: upazila, ancestors };
  }
  if (district) {
    const ancestors = [];
    if (division) ancestors.push({ label: "Division", value: division });
    return { unitLabel: "District", areaName: district, ancestors };
  }
  if (division) {
    return { unitLabel: "Division", areaName: division, ancestors: [] };
  }
  const name = attrs.NAME != null ? String(attrs.NAME) : "Selected area";
  return { unitLabel: "Area", areaName: name, ancestors: [] };
}
