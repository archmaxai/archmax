import { connectDB } from "../infra/db";
import { Connection, StoredQuery, type IConnectionDocument } from "../models/index";
import { SemanticModelFileService } from "./semantic-model-files";
import { SemanticModelDigest, buildSourceMap, type OverviewScope } from "./semantic-model-digest";
import type { Dataset } from "./semantic-model-schema";
import {
  materialiseModelViews,
  scopeSchemaName,
  stripScopedSchemaQualifier,
  redactConnectionSecrets,
  getAttachedCatalogSlugs,
  hardenConnection,
  withQueryTimeout,
  withProjectQuerySlot,
  withRecoverableProjectInstance,
  getQueryTimeoutMs,
} from "./duckdb";
import { validateSqlAst } from "./sql-ast-validation";

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

  await connectDB();
  const connections = (await Connection.find({
    project: projectId,
    isActive: true,
  }).lean()) as IConnectionDocument[];

  const catalogSlugs = getAttachedCatalogSlugs(connections);

  // Sole SQL-safety layer: structural pass via DuckDB's own parser.
  // Runs before any DuckDB connection against the project's federated
  // instance is acquired; the parsing instance is process-wide and
  // isolated. See packages/core/src/services/sql-ast-validation.ts.
  const astError = await validateSqlAst(sql, { mode: "mcp", catalogSlugs });
  if (astError) {
    return { text: astError, isError: true };
  }

  const model = await fileSvc.get(projectId, modelName);
  if (!model) {
    return { text: `Semantic model "${modelName}" not found`, isError: true };
  }

  // `withRecoverableProjectInstance` self-heals a DuckDB instance that an
  // unstable upstream connection has invalidated (disposing + rebuilding it
  // once). Materialisation and query execution both run against the (possibly
  // rebuilt) instance and must let DuckDB errors propagate so the fatal-error
  // detection can fire; the outer catch turns any surviving failure into an
  // `isError` result instead of throwing out of the MCP handler.
  try {
    return await withRecoverableProjectInstance(
      projectId,
      connections,
      { readOnly: true },
      async (instance) => {
        const materialisation = await materialiseModelViews(instance, projectId, model);

        if (materialisation.missingViewQuery.length > 0) {
          const names = materialisation.missingViewQuery.map((n) => `"${n}"`).join(", ");
          // This error fires only when the dataset has neither an authored
          // `view_query` nor enough metadata to infer a default mirror view
          // (no `source`, or no `fields`). The inferred-fallback path covers
          // the simple cases automatically; landing here means the dataset
          // definition itself is incomplete. The error is read by downstream
          // MCP-client LLMs that have no ability to author the semantic
          // model — we route the fix request to the *authoring agent / model
          // owner*, never to a "data team" the end user does not have.
          return {
            text:
              `Dataset(s) ${names} in semantic model "${modelName}" are not queryable: the dataset ` +
              `definition has neither an authored \`view_query\` nor a populated \`fields\` + \`source\` ` +
              `pair the platform could infer a default view from. This is an authoring gap in the model ` +
              `itself, not a transient error and not a user-correctable configuration. Ask the agent (or ` +
              `maintainer) that owns this semantic model to fill in the missing fields/source — or to ` +
              `author an explicit \`view_query\` — and republish.`,
            isError: true,
          };
        }

        if (materialisation.failed.length > 0) {
          // `materialiseModelViews()` leaves the previous VIEW in place when
          // the new body is rejected by the validator or fails at CREATE OR
          // REPLACE time. Refusing to execute the caller's SQL on this path
          // closes a stale-VIEW exposure: an MCP token holder cannot keep
          // querying yesterday's looser body after the maintainer tightened
          // the `view_query` but the rematerialisation failed. Mirror the
          // agent-side `runModelQuery` handling: surface the per-dataset
          // failures with the internal scoped-schema qualifier stripped.
          const failures = materialisation.failed
            .map((f) => `  - ${f.dataset}: ${stripScopedSchemaQualifier(f.error, modelName)}`)
            .join("\n");
          return {
            text:
              `Dataset(s) in semantic model "${modelName}" failed to materialise. ` +
              `The previous view definitions are not used; ask the model maintainer to ` +
              `fix the affected \`view_query\` bodies and republish.\n${failures}`,
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
          } finally {
            db.disconnectSync();
          }
        });
      },
    );
  } catch (err) {
    // The recovery scope above now also covers `getProjectInstance`
    // (which runs `ATTACH` with decrypted connection strings) and view
    // materialisation, so a setup/ATTACH failure can carry `password=…`
    // or an iceberg `TOKEN '…'` in its message. Redact those secret
    // shapes before logging or returning the error to the MCP caller.
    const raw = redactConnectionSecrets(
      err instanceof Error ? err.message : "Query execution failed.",
    );
    console.error("[executeScopedQuery] Query error:", raw);
    const msg = stripScopedSchemaQualifier(raw, modelName);
    const hint = buildColumnHint(msg, model.datasets);
    return {
      text: hint ? `${msg}\n\n${hint}` : msg,
      isError: true,
    };
  }
}
