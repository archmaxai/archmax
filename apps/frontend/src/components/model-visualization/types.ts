export interface SemanticModelFull {
  name: string;
  description?: string;
  datasets: DatasetFull[];
  relationships: RelationshipFull[];
  metrics: MetricFull[];
  custom_extensions?: CustomExtension[];
}

export interface DatasetFull {
  name: string;
  source: string;
  description?: string;
  fields: FieldFull[];
  custom_extensions?: CustomExtension[];
  [key: string]: unknown;
}

export interface FieldFull {
  name: string;
  expression: string | { dialects?: Array<{ dialect: string; expression: string }> };
  description?: string;
  label?: string;
  custom_extensions?: CustomExtension[];
  [key: string]: unknown;
}

export interface RelationshipFull {
  name: string;
  from: string;
  to: string;
  fromColumns?: string[];
  toColumns?: string[];
  from_columns?: string[];
  to_columns?: string[];
  [key: string]: unknown;
}

export interface MetricFull {
  name: string;
  expression: string | { dialects?: Array<{ dialect: string; expression: string }> };
  description?: string;
  [key: string]: unknown;
}

export interface CustomExtension {
  vendor_name: string;
  data: string;
}

export interface ModelDiff {
  addedDatasets: Set<string>;
  removedDatasets: Set<string>;
  modifiedDatasets: Set<string>;
  addedMetrics: Set<string>;
  removedMetrics: Set<string>;
  modifiedMetrics: Set<string>;
  addedRelationships: Set<string>;
  removedRelationships: Set<string>;
  modifiedFields: Map<string, Set<string>>;
}

export interface DatasetGroup {
  id: string;
  name: string;
  datasets: string[];
  color?: string;
}

export const GROUP_COLORS = [
  { name: "blue",    bg: "oklch(0.91 0.06 250)",  border: "oklch(0.70 0.12 250)"  },
  { name: "purple",  bg: "oklch(0.91 0.06 300)",  border: "oklch(0.70 0.12 300)"  },
  { name: "teal",    bg: "oklch(0.92 0.05 180)",  border: "oklch(0.72 0.10 180)"  },
  { name: "amber",   bg: "oklch(0.93 0.05 85)",   border: "oklch(0.75 0.12 85)"   },
  { name: "rose",    bg: "oklch(0.92 0.05 15)",   border: "oklch(0.72 0.12 15)"   },
  { name: "green",   bg: "oklch(0.92 0.05 145)",  border: "oklch(0.72 0.10 145)"  },
  { name: "orange",  bg: "oklch(0.92 0.05 55)",   border: "oklch(0.72 0.12 55)"   },
  { name: "cyan",    bg: "oklch(0.92 0.05 210)",  border: "oklch(0.72 0.10 210)"  },
] as const;

export function getGroupColor(colorName?: string) {
  if (colorName) {
    const found = GROUP_COLORS.find((c) => c.name === colorName);
    if (found) return found;
  }
  return GROUP_COLORS[0];
}

export function parseDatasetGroups(extensions?: CustomExtension[]): DatasetGroup[] {
  if (!extensions) return [];
  for (const ext of extensions) {
    if (ext.vendor_name !== "COMMON") continue;
    try {
      const d = JSON.parse(ext.data);
      if (Array.isArray(d.dataset_groups)) return d.dataset_groups;
    } catch {
      // ignore malformed JSON
    }
  }
  return [];
}

function isGroupExtension(ext: CustomExtension): boolean {
  if (ext.vendor_name !== "COMMON") return false;
  try {
    return "dataset_groups" in JSON.parse(ext.data);
  } catch {
    return false;
  }
}

export function serializeDatasetGroups(
  groups: DatasetGroup[],
  existingExtensions?: CustomExtension[],
): CustomExtension[] {
  const all = existingExtensions ?? [];
  const other = all.filter((ext) => !isGroupExtension(ext));

  if (groups.length === 0) return other;

  const existing = all.find(isGroupExtension);
  let mergedData: Record<string, unknown> = {};
  if (existing) {
    try { mergedData = JSON.parse(existing.data); } catch { /* empty */ }
  }
  mergedData.dataset_groups = groups;

  return [
    ...other,
    { vendor_name: "COMMON", data: JSON.stringify(mergedData) },
  ];
}

export function getFieldDataType(field: FieldFull): string | null {
  const ext = field.custom_extensions?.find((e) => e.vendor_name === "COMMON");
  if (!ext) return null;
  try {
    const d = JSON.parse(ext.data);
    return typeof d.data_type === "string" ? d.data_type : null;
  } catch {
    return null;
  }
}

export function getExpressionString(
  expr: string | { dialects?: Array<{ dialect: string; expression: string }> } | undefined,
): string {
  if (!expr) return "";
  if (typeof expr === "string") return expr;
  return expr.dialects?.[0]?.expression ?? "";
}

export function getRelationshipColumns(r: RelationshipFull): { from: string[]; to: string[] } {
  return {
    from: r.fromColumns ?? r.from_columns ?? [],
    to: r.toColumns ?? r.to_columns ?? [],
  };
}
