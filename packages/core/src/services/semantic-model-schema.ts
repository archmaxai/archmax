import { z } from "zod/v4";
import yaml from "js-yaml";

const dialectEnum = z.enum(["ANSI_SQL", "SNOWFLAKE", "MDX", "TABLEAU", "DATABRICKS"]);

const dialectExpressionSchema = z.object({
  dialect: dialectEnum,
  expression: z.string().min(1),
});

export const expressionSchema = z.object({
  dialects: z.array(dialectExpressionSchema).min(1),
});

export const jsonStringSchema = z.string().refine(
  (val) => {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Must be a valid JSON string" },
);

/**
 * Shape of the JSON payload stored inside a `vendor_name: "COMMON"` extension.
 * We deliberately keep this open (`passthrough`) — only fields with platform
 * meaning are validated explicitly. The wider COMMON payload remains free for
 * dataset-level / field-level COMMON metadata (`data_type`, `example_data`,
 * `validated_queries`, `graph_x`, `dataset_groups`, etc.) that other layers
 * interpret without needing schema support here.
 */
export const commonExtensionDataSchema = z
  .object({
    /**
     * SELECT body the platform wraps as
     * `CREATE OR REPLACE VIEW _scope_<modelName>."<datasetName>" AS <view_query>`.
     * Empty strings are rejected at write time so a dataset with `view_query`
     * declared but blank cannot make it onto disk.
     */
    view_query: z.string().min(1).optional(),
  })
  .passthrough();

export const customExtensionSchema = z
  .object({
    vendor_name: z.string().min(1),
    data: jsonStringSchema,
  })
  .superRefine((ext, ctx) => {
    if (ext.vendor_name !== "COMMON") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(ext.data);
    } catch {
      return; // jsonStringSchema already rejects this case
    }
    const result = commonExtensionDataSchema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ["data", ...issue.path],
        });
      }
    }
  });

export const dimensionSchema = z.object({
  is_time: z.boolean(),
});

/**
 * Coerce a value that YAML misinterpreted as an object back to a string.
 * e.g. `- filter: vendor LIKE ...` becomes { filter: "vendor LIKE ..." }
 * instead of the intended plain string. We recover by re-serialising to YAML.
 */
const yamlCoercedString = z.preprocess(
  (v) => (typeof v === "object" && v !== null && !Array.isArray(v) ? yaml.dump(v).trim() : v),
  z.string(),
);

export const aiContextSchema = z.union([
  z.string(),
  z.object({
    instructions: z.string().optional(),
    synonyms: z.array(yamlCoercedString).optional(),
    examples: z.array(yamlCoercedString).optional(),
  }),
]).optional();

export const fieldSchema = z.object({
  name: z.string().min(1),
  expression: expressionSchema,
  dimension: dimensionSchema.optional(),
  label: z.string().optional(),
  description: z.string().optional().default(""),
  ai_context: aiContextSchema,
  custom_extensions: z.array(customExtensionSchema).optional().default([]),
});

export const datasetSchema = z.object({
  name: z.string().min(1),
  source: z.string().min(1),
  primary_key: z.array(z.string()).optional().default([]),
  unique_keys: z.array(z.array(z.string())).optional().default([]),
  description: z.string().optional().default(""),
  ai_context: aiContextSchema,
  fields: z.array(fieldSchema).optional().default([]),
  custom_extensions: z.array(customExtensionSchema).optional().default([]),
});

export const relationshipSchema = z.object({
  name: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  from_columns: z.array(z.string()).min(1),
  to_columns: z.array(z.string()).min(1),
  ai_context: aiContextSchema,
  custom_extensions: z.array(customExtensionSchema).optional().default([]),
});

export const metricSchema = z.object({
  name: z.string().min(1),
  expression: expressionSchema,
  description: z.string().optional().default(""),
  ai_context: aiContextSchema,
  custom_extensions: z.array(customExtensionSchema).optional().default([]),
});

export const semanticModelSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  ai_context: aiContextSchema,
  datasets: z.array(datasetSchema).optional().default([]),
  relationships: z.array(relationshipSchema).optional().default([]),
  metrics: z.array(metricSchema).optional().default([]),
  custom_extensions: z.array(customExtensionSchema).optional().default([]),
});

export const semanticModelRootSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  ai_context: aiContextSchema,
  datasets: z.array(datasetSchema).optional().default([]),
  relationships: z.array(relationshipSchema).optional().default([]),
  metrics: z.array(metricSchema).optional().default([]),
  custom_extensions: z.array(customExtensionSchema).optional().default([]),
});

export const datasetFileSchema = z.object({
  dataset: datasetSchema,
});

export type SemanticModel = z.infer<typeof semanticModelSchema> & {
  hasConflicts?: boolean;
  rawContent?: string;
};
/**
 * The `viewQuery` field is a *derived* mirror of the `view_query` value stored
 * inside the dataset's `vendor_name: "COMMON"` custom extension (see
 * `commonExtensionDataSchema`). The COMMON extension array remains the source
 * of truth on disk. The file service populates `viewQuery` on read so
 * downstream code does not need to JSON-parse extensions, and folds a caller's
 * `viewQuery` updates back into the COMMON extension on write.
 */
export type Dataset = z.infer<typeof datasetSchema> & { viewQuery?: string | null };
export type Field = z.infer<typeof fieldSchema>;
export type AiContext = z.infer<typeof aiContextSchema>;
export type Relationship = z.infer<typeof relationshipSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type Expression = z.infer<typeof expressionSchema>;
export type CustomExtension = z.infer<typeof customExtensionSchema>;
export type Dimension = z.infer<typeof dimensionSchema>;

const COMMON_VENDOR = "COMMON";

function findCommonExtension(extensions: CustomExtension[] | undefined): {
  index: number;
  data: Record<string, unknown> | null;
} {
  if (!extensions) return { index: -1, data: null };
  const index = extensions.findIndex((ext) => ext.vendor_name === COMMON_VENDOR);
  if (index === -1) return { index, data: null };
  try {
    const parsed = JSON.parse(extensions[index].data);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { index, data: parsed as Record<string, unknown> };
    }
  } catch {
    // fall through
  }
  return { index, data: null };
}

/**
 * Extract the `view_query` from a dataset's COMMON custom extension, if any.
 * Returns `null` when the extension is missing, the JSON is invalid, or the
 * key is absent / blank.
 */
export function extractViewQuery(dataset: Pick<Dataset, "custom_extensions">): string | null {
  const { data } = findCommonExtension(dataset.custom_extensions);
  if (!data) return null;
  const raw = data.view_query;
  if (typeof raw !== "string" || raw.length === 0) return null;
  return raw;
}

/**
 * Return a new `custom_extensions` array with the `view_query` value folded
 * into the COMMON extension's JSON payload.
 *
 * - `viewQuery: string` → the COMMON extension is created if missing, or its
 *   JSON payload is patched to include `view_query`.
 * - `viewQuery: null` → the `view_query` key is removed from the COMMON
 *   extension's JSON payload. If the COMMON extension becomes an empty
 *   object, it is removed from the array.
 */
export function setViewQueryOnExtensions(
  extensions: CustomExtension[] | undefined,
  viewQuery: string | null,
): CustomExtension[] {
  const list: CustomExtension[] = extensions ? extensions.map((ext) => ({ ...ext })) : [];
  const index = list.findIndex((ext) => ext.vendor_name === COMMON_VENDOR);

  if (index === -1) {
    if (viewQuery === null || viewQuery.length === 0) return list;
    list.push({
      vendor_name: COMMON_VENDOR,
      data: JSON.stringify({ view_query: viewQuery }),
    });
    return list;
  }

  let parsed: Record<string, unknown> = {};
  try {
    const candidate = JSON.parse(list[index].data);
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      parsed = candidate as Record<string, unknown>;
    }
  } catch {
    // treat unparsable payload as empty so we don't lose the new view_query
  }

  if (viewQuery === null || viewQuery.length === 0) {
    delete parsed.view_query;
    if (Object.keys(parsed).length === 0) {
      list.splice(index, 1);
      return list;
    }
  } else {
    parsed.view_query = viewQuery;
  }

  list[index] = { ...list[index], data: JSON.stringify(parsed) };
  return list;
}
