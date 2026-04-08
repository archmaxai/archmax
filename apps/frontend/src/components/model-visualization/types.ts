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
