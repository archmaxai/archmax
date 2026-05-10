import { connectDB } from "../infra/db";
import { Connection, StoredQuery, type IConnectionDocument } from "../models/index";
import { SemanticModelFileService } from "./semantic-model-files";
import { SemanticModelDigest, buildSourceMap, type OverviewScope } from "./semantic-model-digest";
import type { Dataset } from "./semantic-model-schema";
import {
  getProjectInstance,
  materialiseModelViews,
  scopeSchemaName,
  stripScopedSchemaQualifier,
  getAttachedCatalogSlugs,
  hardenConnection,
  withQueryTimeout,
  withProjectQuerySlot,
  getQueryTimeoutMs,
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

export const EXECUTE_QUERY_DESCRIPTION = [
  "Run a read-only SQL query scoped to a single semantic model.",
  "The SQL engine is **DuckDB** — you MUST use DuckDB SQL syntax, NOT PostgreSQL or MySQL.",
  "The modelName parameter selects which model's datasets are available as tables.",
  "Use dataset names directly as table names — e.g. FROM orders, FROM customers.",
  "Do NOT add schema or catalog prefixes; the search_path resolves dataset names automatically.",
  "Only SELECT / WITH / EXPLAIN / DESCRIBE queries are allowed.",
  "Use $1, $2, ... placeholders and provide values in the params array.",
  `Results are limited to ${MAX_ROWS} rows with a ${getQueryTimeoutMs() / 1000}-second timeout.`,
  "",
  "When store is true (the default), the response includes a storedQueryId.",
  "Pass this ID to execute_stored_query to re-run the same query later, optionally with different params.",
  "",
  "DuckDB JSON cheat-sheet (PostgreSQL equivalents DO NOT exist here):",
  "- Unnest a JSON array column: UNNEST(from_json(col, '[\"JSON\"]')) AS t(elem)",
  "- Extract a string from JSON: json_extract_string(obj, '$.key')",
  "- Extract nested value: json_extract(obj, '$.path.to.value')",
  "- Array length: json_array_length(col)",
  "- DO NOT use: json_array_elements, jsonb_each, jsonb_array_elements, row_to_json, array_agg(DISTINCT ...) — these are PostgreSQL-only.",
].join("\n");

export const EXECUTE_STORED_QUERY_DESCRIPTION = [
  "Re-execute a previously stored query by its ID.",
  "The storedQueryId is returned by execute_query when store is true (the default).",
  "Optionally override the original parameter values by providing a new params array.",
  "If params is omitted, the stored parameters are used.",
  `Results follow the same format, limits (${MAX_ROWS} rows), and timeout (${getQueryTimeoutMs() / 1000}s) as execute_query.`,
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

const BINDER_COL_PATTERNS = [
  /Referenced column "([^"]+)" not found/i,
  /does not have a column named "([^"]+)"/i,
];
const BINDER_TABLE_RE = /Table with name (\S+) does not exist/i;

function buildColumnHint(errorMsg: string, datasets: Dataset[]): string | null {
  const colMatch = BINDER_COL_PATTERNS.some((re) => re.test(errorMsg));
  const tableMatch = BINDER_TABLE_RE.test(errorMsg);
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
  storedQueryId?: string;
}

export async function storeQuery(
  projectId: string,
  tokenId: string | null,
  modelName: string,
  sql: string,
  params: string[],
): Promise<string> {
  await connectDB();
  const doc = await StoredQuery.create({
    project: projectId,
    tokenId,
    modelName,
    sql,
    params,
  });
  return doc._id.toString();
}

export async function executeStoredQuery(
  fileSvc: SemanticModelFileService,
  projectId: string,
  scopes: string[],
  storedQueryId: string,
  paramsOverride?: string[],
): Promise<ExecuteQueryResult> {
  await connectDB();
  const STORED_QUERY_NOT_FOUND =
    "Stored query not found. The ID may be invalid or from an older session. " +
    "Re-run the query with execute_query to get a new storedQueryId.";
  let stored;
  try {
    stored = await StoredQuery.findOne({ _id: storedQueryId, project: projectId }).lean();
  } catch {
    return { text: STORED_QUERY_NOT_FOUND, isError: true };
  }
  if (!stored) {
    return { text: STORED_QUERY_NOT_FOUND, isError: true };
  }
  if (!scopes.includes(stored.modelName)) {
    return { text: `Access denied: token does not have access to model "${stored.modelName}"`, isError: true };
  }
  const params = paramsOverride ?? stored.params;
  return executeScopedQuery(fileSvc, projectId, scopes, stored.modelName, stored.sql, params);
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
  const materialisation = await materialiseModelViews(instance, projectId, model);

  if (materialisation.missingViewQuery.length > 0) {
    const names = materialisation.missingViewQuery.map((n) => `"${n}"`).join(", ");
    return {
      text:
        `Semantic model "${modelName}" cannot be queried: dataset(s) ${names} have no \`view_query\`. ` +
        `Each dataset's COMMON custom extension must define a non-empty \`view_query\` SELECT body before \`execute_query\` will materialise its view.`,
      isError: true,
    };
  }

  return withProjectQuerySlot(projectId, async () => {
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

      const queryResult = await withQueryTimeout(db, () => prepared.run());

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
      const raw = err instanceof Error ? err.message : "Query execution failed.";
      const msg = stripScopedSchemaQualifier(raw, modelName);
      const hint = buildColumnHint(msg, model.datasets);
      return {
        text: hint ? `${msg}\n\n${hint}` : msg,
        isError: true,
      };
    } finally {
      db.disconnectSync();
    }
  });
}
