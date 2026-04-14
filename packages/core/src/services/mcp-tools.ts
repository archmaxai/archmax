import { connectDB } from "../infra/db";
import { Connection, type IConnectionDocument } from "../models/index";
import { SemanticModelFileService } from "./semantic-model-files";
import { SemanticModelDigest, buildSourceMap, type OverviewScope } from "./semantic-model-digest";
import type { Dataset } from "./semantic-model-schema";
import {
  getProjectInstance,
  createScopedViews,
  scopeSchemaName,
  getAttachedCatalogSlugs,
  hardenConnection,
} from "./duckdb";
import { validateReadOnlySQL, validateScopedSQL } from "./sql-validation";

export interface ToolResult {
  text: string;
  isError?: boolean;
}

function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? Number(v) : v,
  );
}

const MAX_ROWS = 1000;
const QUERY_TIMEOUT_MS = 30_000;

export const EXECUTE_QUERY_DESCRIPTION = [
  "Run a read-only SQL query scoped to a single semantic model.",
  "The SQL engine is **DuckDB** — you MUST use DuckDB SQL syntax, NOT PostgreSQL or MySQL.",
  "The modelName parameter selects which model's datasets are available as tables.",
  "Use dataset names directly as table names — e.g. FROM orders, FROM customers.",
  "Do NOT add schema or catalog prefixes; the search_path resolves dataset names automatically.",
  "Only SELECT / WITH / EXPLAIN / DESCRIBE queries are allowed.",
  "Use $1, $2, ... placeholders and provide values in the params array.",
  `Results are limited to ${MAX_ROWS} rows with a ${QUERY_TIMEOUT_MS / 1000}-second timeout.`,
  "",
  "DuckDB JSON cheat-sheet (PostgreSQL equivalents DO NOT exist here):",
  "- Unnest a JSON array column: UNNEST(from_json(col, '[\"JSON\"]')) AS t(elem)",
  "- Extract a string from JSON: json_extract_string(obj, '$.key')",
  "- Extract nested value: json_extract(obj, '$.path.to.value')",
  "- Array length: json_array_length(col)",
  "- DO NOT use: json_array_elements, jsonb_each, jsonb_array_elements, row_to_json, array_agg(DISTINCT ...) — these are PostgreSQL-only.",
].join("\n");

export async function listSemanticModels(
  fileSvc: SemanticModelFileService,
  projectId: string,
  scopes: string[],
): Promise<ToolResult> {
  const models = await fileSvc.list(projectId);
  if (models.length === 0) {
    return { text: "No semantic models found for this project. Please ensure that semantic model YAML files exist and are valid." };
  }
  const filtered = models.filter((m: { name: string }) => scopes.includes(m.name));
  if (filtered.length === 0) {
    const available = models.map((m: { name: string }) => m.name).join(", ");
    return {
      text: `None of the models in your access scope were found. Your scope: [${scopes.join(", ")}]. Available models: [${available}].`,
      isError: true,
    };
  }
  const lines = filtered.map((m: { name: string; description?: string; datasets: unknown[]; metrics: unknown[] }) => {
    const desc = m.description?.trim() ? `\n${m.description.trim()}\n` : "";
    return `## ${m.name}${desc}\n- **Datasets:** ${m.datasets.length}\n- **Metrics:** ${m.metrics.length}`;
  });
  return { text: `# Semantic Models\n\n${lines.join("\n\n")}` };
}

export async function getSemanticModelOverview(
  fileSvc: SemanticModelFileService,
  projectId: string,
  scopes: string[],
  modelName: string,
  opts: { scope?: OverviewScope; page?: number; itemsPerPage?: number; showTableNames?: boolean },
): Promise<ToolResult> {
  if (!scopes.includes(modelName)) {
    return { text: `Access denied: token does not have access to model "${modelName}"`, isError: true };
  }
  const model = await fileSvc.get(projectId, modelName);
  if (!model) {
    return { text: `Semantic model "${modelName}" not found`, isError: true };
  }
  const digest = SemanticModelDigest.overview(model, {
    scope: opts.scope,
    page: opts.page ?? 1,
    itemsPerPage: opts.itemsPerPage,
    showTableNames: opts.showTableNames ?? true,
  });
  return { text: digest.content };
}

export async function getDatasetFields(
  fileSvc: SemanticModelFileService,
  projectId: string,
  scopes: string[],
  modelName: string,
  datasets: { name: string; page?: number }[],
  opts: { itemsPerPage?: number },
): Promise<ToolResult> {
  if (!scopes.includes(modelName)) {
    return { text: `Access denied: token does not have access to model "${modelName}"`, isError: true };
  }
  const model = await fileSvc.get(projectId, modelName);
  if (!model) {
    return { text: `Semantic model "${modelName}" not found`, isError: true };
  }

  const srcMap = buildSourceMap(model.datasets);
  const sections: string[] = [];
  const errors: string[] = [];
  for (const entry of datasets) {
    const ds = model.datasets.find((d) => d.name === entry.name);
    if (ds) {
      const digest = SemanticModelDigest.dataset(ds, entry.page ?? 1, opts.itemsPerPage ?? 50, srcMap);
      sections.push(digest.content);
    } else {
      errors.push(`Dataset "${entry.name}" not found in model "${modelName}"`);
    }
  }

  if (sections.length === 0) {
    return { text: errors.join("\n"), isError: true };
  }

  let content = sections.join("\n\n---\n\n");
  if (errors.length > 0) {
    content += "\n\n---\n\n" + errors.join("\n");
  }
  return { text: content };
}

const BINDER_COL_RE = /Referenced column "([^"]+)" not found/i;
const BINDER_TABLE_RE = /Table with name (\S+) does not exist/i;

function buildColumnHint(errorMsg: string, datasets: Dataset[]): string | null {
  const colMatch = errorMsg.match(BINDER_COL_RE);
  const tableMatch = errorMsg.match(BINDER_TABLE_RE);
  if (!colMatch && !tableMatch) return null;

  const lines: string[] = [
    "HINT: Use only the dataset and field names from the semantic model. Available datasets and fields:",
  ];
  for (const ds of datasets) {
    const fields = ds.fields.map((f) => f.name).join(", ");
    lines.push(`  ${ds.name}: ${fields}`);
  }
  return lines.join("\n");
}

export interface ExecuteQueryResult extends ToolResult {
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  truncated?: boolean;
}

export async function executeScopedQuery(
  fileSvc: SemanticModelFileService,
  projectId: string,
  scopes: string[],
  modelName: string,
  sql: string,
  params: string[] = [],
): Promise<ExecuteQueryResult> {
  if (!scopes.includes(modelName)) {
    return { text: `Access denied: token does not have access to model "${modelName}"`, isError: true };
  }

  const readOnlyError = validateReadOnlySQL(sql);
  if (readOnlyError) {
    return { text: readOnlyError, isError: true };
  }

  await connectDB();
  const connections = (await Connection.find({
    project: projectId,
    isActive: true,
  }).lean()) as IConnectionDocument[];

  const catalogSlugs = getAttachedCatalogSlugs(connections);
  const scopedError = validateScopedSQL(sql, catalogSlugs);
  if (scopedError) {
    return { text: scopedError, isError: true };
  }

  const model = await fileSvc.get(projectId, modelName);
  if (!model) {
    return { text: `Semantic model "${modelName}" not found`, isError: true };
  }

  const instance = await getProjectInstance(projectId, connections, { readOnly: true });
  await createScopedViews(instance, projectId, model);

  const db = await instance.connect();
  try {
    const hasIceberg = connections.some((c) => c.type === "iceberg");
    await hardenConnection(db, scopeSchemaName(modelName), { allowExternalAccess: hasIceberg });

    const prepared = await db.prepare(sql);
    if (params.length > 0) {
      for (let i = 0; i < params.length; i++) {
        prepared.bindVarchar(i + 1, String(params[i]));
      }
    }

    const queryResult = await Promise.race([
      prepared.run(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Query timed out after ${QUERY_TIMEOUT_MS / 1000}s`)),
          QUERY_TIMEOUT_MS,
        ),
      ),
    ]);

    const rows: Record<string, unknown>[] = [];
    const columns = queryResult.columnNames();
    for await (const chunk of queryResult) {
      const chunkRows = chunk.getRows();
      for (const row of chunkRows) {
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i++) {
          obj[columns[i]] = row[i];
        }
        rows.push(obj);
        if (rows.length >= MAX_ROWS) break;
      }
      if (rows.length >= MAX_ROWS) break;
    }

    const payload = safeStringify({
      columns,
      rows,
      rowCount: rows.length,
      truncated: rows.length >= MAX_ROWS,
    });

    return { text: payload, columns, rows, rowCount: rows.length, truncated: rows.length >= MAX_ROWS };
  } catch (err) {
    console.error("[executeScopedQuery] Query error:", err);
    const msg = err instanceof Error ? err.message : "Query execution failed.";
    const hint = buildColumnHint(msg, model.datasets);
    return {
      text: hint ? `${msg}\n\n${hint}` : msg,
      isError: true,
    };
  } finally {
    db.disconnectSync();
  }
}
