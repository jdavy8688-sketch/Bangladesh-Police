/**
 * Indicator catalog.
 *
 * `id` is the canonical field name from the hosted tables (Division / District /
 * Upazila / Union / Crime_Data). The map controller resolves it against each
 * table (and layer) schema using case-insensitive name / alias matching.
 *
 * To retarget this app (health, education, …) replace this file and keep the
 * rest of the workbench. Fields that are missing from a given table are hidden
 * at runtime.
 */

export type IndicatorField = {
  id: string;
  label: string;
};

export type IndicatorGroup = {
  id: string;
  label: string;
  description: string;
  fields: IndicatorField[];
  /** When true, values come from Crime_Data (Unit × year × month), not admin tables. */
  source?: "admin" | "crime";
};

/** Composition chart definition for the analytics panel. */
export type CompositionChartDef = {
  id: string;
  title: string;
  description?: string;
  /** pie = donut of field shares; compare = side-by-side bars of two totals */
  type: "pie" | "compare";
  fieldIds: string[];
};

export const INDICATOR_GROUPS: IndicatorGroup[] = [
  {
    id: "Incident",
    label: "Incident",
    description: "Crime, judgmental, resilience and impact counts",
    source: "admin",
    fields: [
      { id: "total_crime", label: "Total Crime" },
      { id: "crime", label: "Crime" },
      { id: "judgmental", label: "Judgmental" },
      { id: "resilience", label: "Resilience" },
      { id: "total_death", label: "Death" },
      { id: "total_injured", label: "Injured" },
      { id: "dominant_count", label: "Dominant Count" },
    ],
  },
  {
    id: "Crimes",
    label: "Crimes",
    description: "Crime types from Crime_Data (by police Unit, year, month)",
    source: "crime",
    fields: [
      { id: "total_cases", label: "Total Cases" },
      { id: "dacoity", label: "Dacoity" },
      { id: "robbery", label: "Robbery" },
      { id: "murder", label: "Murder" },
      { id: "speedy_trial", label: "Speedy Trial" },
      { id: "riot", label: "Riot" },
      { id: "woman_child_repression", label: "Woman & Child Repression" },
      { id: "kidnapping", label: "Kidnapping" },
      { id: "police_assault", label: "Police Assault" },
      { id: "burglary", label: "Burglary" },
      { id: "theft", label: "Theft" },
      { id: "other_cases", label: "Other Cases" },
      { id: "recovery_cases", label: "Recovery Cases" },
    ],
  },
  {
    id: "Demography",
    label: "Demography",
    description: "Population structure and religious composition",
    source: "admin",
    fields: [
      { id: "Population", label: "Population" },
      { id: "Male_Population", label: "Male Population" },
      { id: "Female_Population", label: "Female Population" },
      { id: "Floating_Population", label: "Floating Population" },
      { id: "Age_0_14", label: "Age 0-14" },
      { id: "Age_15_34", label: "Age 15-34" },
      { id: "Age_35_64", label: "Age 35-64" },
      { id: "Age_65_Plus", label: "Age 65 Plus" },
      { id: "Muslim_Population", label: "Muslim Population" },
      { id: "Hindu_Population", label: "Hindu Population" },
      { id: "Other_Religion_Population", label: "Other Religion Population" },
      { id: "total_population", label: "Total Population (alt)" },
    ],
  },
  {
    id: "Socio-Economic",
    label: "Socio-Economic",
    description: "Households, youth work status and employment sector",
    source: "admin",
    fields: [
      { id: "Total_Households", label: "Total Households" },
      { id: "Pucca_Households", label: "Pucca Households" },
      { id: "Semi_Pucca_Households", label: "Semi Pucca Households" },
      { id: "Kutcha_Jhupri_Households", label: "Katcha Jhupri Households" },
      { id: "Employed_Youth", label: "Employed Youth" },
      { id: "Household_Work_Youth", label: "Household Work Youth" },
      { id: "Looking_For_Job_Youth", label: "Looking For Job Youth" },
      { id: "Not_Working_Youth", label: "Not Working Youth" },
      { id: "Agriculture_Employment", label: "Agriculture Employment" },
      { id: "Industry_Employment", label: "Industry Employment" },
      { id: "Service_Employment", label: "Service Employment" },
      { id: "Internet_Users_Youth", label: "Internet Users Youth" },
    ],
  },
  {
    id: "Point of Interest",
    label: "Point of Interest",
    description: "Educational institutions and markets (polygon counts)",
    source: "admin",
    fields: [
      { id: "kindergarten", label: "Kindergarten" },
      { id: "school", label: "School" },
      { id: "madrasha", label: "Madrasha" },
      { id: "college", label: "College" },
      { id: "university", label: "University" },
      { id: "Market", label: "Market" },
      { id: "total_educational", label: "Total Educational Institutions" },
    ],
  },
];

/**
 * Ordered KPI cards for the analytics panel (left → right, top → bottom in a 2-col grid).
 * Falls back to the first fields of the group when a group is not listed.
 */
export const KPI_FIELDS_BY_GROUP: Record<string, string[]> = {
  Incident: [
    "total_crime",
    "crime",
    "judgmental",
    "resilience",
    "total_death",
    "total_injured",
  ],
  Crimes: [
    "total_cases",
    "murder",
    "robbery",
    "dacoity",
    "theft",
    "woman_child_repression",
  ],
  Demography: [
    "Population",
    "Floating_Population",
    "Male_Population",
    "Female_Population",
    "Age_0_14",
    "Age_15_34",
    "Muslim_Population",
    "Hindu_Population",
  ],
  "Socio-Economic": [
    "Total_Households",
    "Internet_Users_Youth",
    "Pucca_Households",
    "Kutcha_Jhupri_Households",
    "Employed_Youth",
    "Not_Working_Youth",
  ],
  "Point of Interest": [
    "kindergarten",
    "school",
    "madrasha",
    "college",
    "university",
    "Market",
  ],
};

/**
 * Per-group composition charts shown in the analytics panel.
 * Field ids must match the catalog; missing runtime values are skipped.
 */
export const COMPOSITION_CHARTS: Record<string, CompositionChartDef[]> = {
  Incident: [
    {
      id: "incident-type",
      title: "Incident type",
      description: "Crime, resilience and judgmental",
      type: "pie",
      fieldIds: ["crime", "resilience", "judgmental"],
    },
    {
      id: "incident-impact",
      title: "Impact",
      description: "Injured and death",
      type: "pie",
      fieldIds: ["total_injured", "total_death"],
    },
  ],
  Crimes: [
    {
      id: "crime-major",
      title: "Major crimes",
      description: "Murder, robbery, dacoity, theft",
      type: "pie",
      fieldIds: ["murder", "robbery", "dacoity", "theft"],
    },
    {
      id: "crime-other",
      title: "Other case types",
      description: "Burglary, kidnapping, repression, recovery",
      type: "pie",
      fieldIds: [
        "burglary",
        "kidnapping",
        "woman_child_repression",
        "police_assault",
        "riot",
        "speedy_trial",
        "other_cases",
        "recovery_cases",
      ],
    },
  ],
  Demography: [
    {
      id: "demo-sex",
      title: "Male / Female",
      description: "Sex composition",
      type: "pie",
      fieldIds: ["Male_Population", "Female_Population"],
    },
    {
      id: "demo-age",
      title: "Age group",
      description: "Population by age band",
      type: "pie",
      fieldIds: ["Age_0_14", "Age_15_34", "Age_35_64", "Age_65_Plus"],
    },
    {
      id: "demo-religion",
      title: "Religion",
      description: "Muslim, Hindu and other",
      type: "pie",
      fieldIds: ["Muslim_Population", "Hindu_Population", "Other_Religion_Population"],
    },
    {
      id: "demo-floating",
      title: "Floating vs total population",
      description: "Comparison of floating population and total population",
      type: "compare",
      fieldIds: ["Floating_Population", "Population"],
    },
  ],
  "Socio-Economic": [
    {
      id: "socio-household",
      title: "Household type",
      description: "Pucca, semi pucca and katcha jhupri",
      type: "pie",
      fieldIds: ["Pucca_Households", "Semi_Pucca_Households", "Kutcha_Jhupri_Households"],
    },
    {
      id: "socio-youth-work",
      title: "Youth work status",
      description: "Employment and activity among youth",
      type: "pie",
      fieldIds: [
        "Employed_Youth",
        "Household_Work_Youth",
        "Looking_For_Job_Youth",
        "Not_Working_Youth",
      ],
    },
    {
      id: "socio-sector",
      title: "Employment sector",
      description: "Agriculture, industry and service",
      type: "pie",
      fieldIds: ["Agriculture_Employment", "Industry_Employment", "Service_Employment"],
    },
    {
      id: "socio-internet",
      title: "Internet users vs total population",
      description: "Youth internet users compared with total population",
      type: "compare",
      fieldIds: ["Internet_Users_Youth", "Population"],
    },
  ],
  "Point of Interest": [
    {
      id: "poi-education",
      title: "Educational institutions",
      description: "Kindergarten through university",
      type: "pie",
      fieldIds: ["kindergarten", "school", "madrasha", "college", "university"],
    },
  ],
};

export const KPI_FIELDS: IndicatorField[] = [
  { id: "total_crime", label: "Total Crime" },
  { id: "crime", label: "Crime" },
  { id: "total_death", label: "Deaths" },
  { id: "total_injured", label: "Injured" },
  { id: "Population", label: "Population" },
];

export function getIndicatorGroup(id: string): IndicatorGroup | undefined {
  return INDICATOR_GROUPS.find((g) => g.id === id);
}

export function getIndicatorField(id: string): IndicatorField | undefined {
  for (const group of INDICATOR_GROUPS) {
    const field = group.fields.find((f) => f.id === id);
    if (field) return field;
  }
  return undefined;
}

export function labelForField(id: string): string {
  return getIndicatorField(id)?.label ?? id.replaceAll("_", " ");
}

export function fieldsForGroups(groupIds: string[]): IndicatorField[] {
  const seen = new Set<string>();
  const result: IndicatorField[] = [];
  for (const groupId of groupIds) {
    const group = getIndicatorGroup(groupId);
    if (!group) continue;
    for (const field of group.fields) {
      if (seen.has(field.id)) continue;
      seen.add(field.id);
      result.push(field);
    }
  }
  return result;
}

export function allIndicatorFields(): IndicatorField[] {
  return fieldsForGroups(INDICATOR_GROUPS.map((g) => g.id));
}

export function compositionChartsForGroup(groupId: string): CompositionChartDef[] {
  return COMPOSITION_CHARTS[groupId] ?? [];
}

/** KPI field defs for a group, in display order. */
export function kpiFieldsForGroup(groupId: string): IndicatorField[] {
  const ids = KPI_FIELDS_BY_GROUP[groupId];
  if (ids?.length) {
    return ids
      .map((id) => getIndicatorField(id))
      .filter((f): f is IndicatorField => Boolean(f));
  }
  return (getIndicatorGroup(groupId)?.fields ?? []).slice(0, 6);
}
