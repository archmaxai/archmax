import { z } from "zod/v4";

const dialectEnum = z.enum(["ANSI_SQL", "SNOWFLAKE", "MDX", "TABLEAU", "DATABRICKS"]);

const dialectExpressionSchema = z.object({
  dialect: dialectEnum,
  expression: z.string().min(1),
});

export const expressionSchema = z.object({
  dialects: z.array(dialectExpressionSchema).min(1),
});

export const customExtensionSchema = z.object({
  vendor_name: z.string().min(1),
  data: z.string(),
});

export const dimensionSchema = z.object({
  is_time: z.boolean(),
});

export const aiContextSchema = z.union([
  z.string(),
  z.object({
    instructions: z.string().optional(),
    synonyms: z.array(z.string()).optional(),
    examples: z.array(z.string()).optional(),
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

export type SemanticModel = z.infer<typeof semanticModelSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type Field = z.infer<typeof fieldSchema>;
export type Relationship = z.infer<typeof relationshipSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type Expression = z.infer<typeof expressionSchema>;
export type CustomExtension = z.infer<typeof customExtensionSchema>;
export type Dimension = z.infer<typeof dimensionSchema>;
