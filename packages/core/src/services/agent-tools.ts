import { tool } from "@langchain/core/tools";
import { z } from "zod/v4";
import { getEnv } from "../config/env";
import { Connection, TestAgent, TestCase, type IConnectionDocument } from "../models/index";
import { connectDB } from "../infra/db";
import {
  getAttachedCatalogSlugs,
  getProjectInstance,
  hardenConnection,
  materialiseModelViews,
  scopeSchemaName,
  stripScopedSchemaQualifier,
  withProjectQuerySlot,
  withQueryTimeout,
} from "./duckdb";
import { validateSqlAst } from "./sql-ast-validation";
import { DocumentFileService } from "./document-files";
import { GitService } from "./git";
import { SemanticModelFileService } from "./semantic-model-files";
import { SEMANTIC_MODEL_AGENT_PROMPT } from "../prompts/index";
import type { ValidatingFilesystemBackend } from "./agent-filesystem";

function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? Number(v) : v,
  );
}

const MAX_ROWS = 1000;

export function makeExecuteQueryTool(projectId: string) {
  return tool(
    async ({ sql, params }: { sql: string; params: unknown[] }) => {
      // Sole SQL-safety layer for agent schema exploration. 'agent'
      // mode skips BASE_TABLE catalog/schema rules so the agent can
      // legitimately query `information_schema.tables` and
      // `catalog.schema.table` references for attached connections;
      // the statement-shape allowlist, table-function allowlist,
      // scalar-function denylist, and `_scope_*` / `duckdb_*` prefix
      // bans still apply.
      const astError = await validateSqlAst(sql, { mode: "agent" });
      if (astError) {
        return JSON.stringify({ error: astError });
      }

      await connectDB();
      const connections = (await Connection.find({
        project: projectId,
        isActive: true,
      }).lean()) as IConnectionDocument[];

      const instance = await getProjectInstance(projectId, connections, { readOnly: true });

      return withProjectQuerySlot(projectId, async () => {
        const db = await instance.connect();
        try {
          const hasIceberg = connections.some((c) => c.type === "iceberg");
          await hardenConnection(db, undefined, { allowExternalAccess: hasIceberg });
          const prepared = await db.prepare(sql);
          if (params.length > 0) {
            for (let i = 0; i < params.length; i++) {
              prepared.bindVarchar(i + 1, String(params[i]));
            }
          }

          const result = await withQueryTimeout(db, () => prepared.run());

          const rows: Record<string, unknown>[] = [];
          const columns = result.columnNames();
          for await (const chunk of result) {
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

          return safeStringify({
            columns,
            rows,
            rowCount: rows.length,
            truncated: rows.length >= MAX_ROWS,
          });
        } catch (err) {
          console.error("[executeQuery] Query error:", err);
          return safeStringify({ error: "Query execution failed." });
        } finally {
          db.disconnectSync();
        }
      });
    },
    {
      name: "executeQuery",
      description:
        "Run a read-only SQL query against the project's catalogs for **schema exploration** — " +
        "use this for `information_schema`, sampling raw source tables, and validating join " +
        "cardinalities. Do NOT use it to test scoped views — use `runModelQuery` for that. " +
        "The SQL engine is DuckDB — use DuckDB SQL syntax, NOT PostgreSQL or MySQL. " +
        "Only SELECT / WITH / EXPLAIN / DESCRIBE queries are allowed. " +
        "All database connections are attached as named catalogs — you MUST fully qualify every table as catalog.schema.table (e.g. Shopify.public.shopify_orders). " +
        "Use $1, $2, ... placeholders and provide values in the params array. " +
        "Results are limited to 1000 rows. " +
        "For JSON arrays use UNNEST(from_json(col, '[\"JSON\"]')) AS t(elem), NOT json_array_elements (PostgreSQL-only).",
      schema: z.object({
        sql: z.string().describe("SQL query with $1, $2, ... placeholders"),
        params: z.array(z.unknown()).describe("Parameter values for placeholders").default([]),
      }),
    },
  );
}

/**
 * Agent tool for testing a model's authored views.
 *
 * Counterpart to MCP `execute_query`: queries reference datasets by their
 * **bare name** (resolved via `search_path = _scope_<modelName>`). The agent
 * never sees the internal `_scope_*` schema — error messages are rewritten
 * to drop that qualifier before being returned.
 *
 * On every call, this tool re-runs `materialiseModelViews` so the latest
 * `view_query` from disk is reflected. There is no in-memory cache.
 */
export function makeRunModelQueryTool(projectId: string) {
  return tool(
    async ({
      modelName,
      sql,
      params,
    }: {
      modelName: string;
      sql: string;
      params: unknown[];
    }) => {
      const fileSvc = new SemanticModelFileService(getEnv().projectsDir);

      await connectDB();
      const connections = (await Connection.find({
        project: projectId,
        isActive: true,
      }).lean()) as IConnectionDocument[];

      const catalogSlugs = getAttachedCatalogSlugs(connections);

      // Sole SQL-safety layer. `runModelQuery` queries model-scoped
      // views by bare dataset name, so it uses 'mcp' mode (full
      // BASE_TABLE rules including system-catalog and bare-name
      // enforcement) — identical to the MCP `execute_query` path.
      const astError = await validateSqlAst(sql, { mode: "mcp", catalogSlugs });
      if (astError) {
        return JSON.stringify({ error: astError });
      }

      const model = await fileSvc.get(projectId, modelName);
      if (!model) {
        return JSON.stringify({
          error: `Semantic model "${modelName}" not found. Use list_dir or fs to inspect what models exist.`,
        });
      }

      const instance = await getProjectInstance(projectId, connections, { readOnly: true });
      const materialisation = await materialiseModelViews(instance, projectId, model);

      if (materialisation.missingViewQuery.length > 0) {
        const names = materialisation.missingViewQuery.map((n) => `"${n}"`).join(", ");
        return JSON.stringify({
          error:
            `Model "${modelName}" cannot be queried yet: dataset(s) ${names} are missing a \`view_query\`. ` +
            `Add a non-empty \`view_query\` to each dataset's COMMON custom extension before testing.`,
        });
      }

      if (materialisation.failed.length > 0) {
        const failures = materialisation.failed.map((f) => ({
          dataset: f.dataset,
          error: stripScopedSchemaQualifier(f.error, modelName),
        }));
        return JSON.stringify({
          error:
            `One or more datasets in "${modelName}" failed to materialise. ` +
            `Fix their \`view_query\` and retry.`,
          failures,
        });
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

          const result = await withQueryTimeout(db, () => prepared.run());

          const rows: Record<string, unknown>[] = [];
          const columns = result.columnNames();
          for await (const chunk of result) {
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

          return safeStringify({
            columns,
            rows,
            rowCount: rows.length,
            truncated: rows.length >= MAX_ROWS,
          });
        } catch (err) {
          console.error("[runModelQuery] Query error:", err);
          const raw = err instanceof Error ? err.message : "Query execution failed.";
          const msg = stripScopedSchemaQualifier(raw, modelName);
          return JSON.stringify({ error: msg });
        } finally {
          db.disconnectSync();
        }
      });
    },
    {
      name: "runModelQuery",
      description:
        "Run a query against a model you have authored. Reference datasets by their bare name " +
        "(e.g. `SELECT * FROM \"orders\" LIMIT 5`). Use this to confirm a `view_query` you just " +
        "wrote materialises and returns the rows you expected. Filtering and projection are the " +
        "responsibility of `view_query`, not of this query. " +
        "The SQL engine is DuckDB — use DuckDB SQL syntax, NOT PostgreSQL or MySQL. " +
        "Only SELECT / WITH / EXPLAIN / DESCRIBE queries are allowed. " +
        "Use $1, $2, ... placeholders and provide values in the params array. " +
        "Results are limited to 1000 rows.",
      schema: z.object({
        modelName: z.string().describe("Name of the semantic model whose datasets you want to query"),
        sql: z.string().describe("SQL query referencing datasets by bare name (e.g. FROM orders)"),
        params: z.array(z.unknown()).describe("Parameter values for $1, $2, ... placeholders").default([]),
      }),
    },
  );
}

export function makeDeleteTool(backend: ValidatingFilesystemBackend) {
  return tool(
    async ({ path: filePath, recursive }: { path: string; recursive: boolean }) => {
      const result = await backend.delete(filePath, recursive);
      if (result.error) return JSON.stringify({ error: result.error });
      return JSON.stringify({ deleted: result.path });
    },
    {
      name: "rm",
      description:
        "Delete a file or directory from the project filesystem. " +
        "Set recursive to true to delete non-empty directories.",
      schema: z.object({
        path: z.string().describe("Absolute virtual path to the file or directory to delete"),
        recursive: z
          .boolean()
          .describe("If true, recursively delete directories and their contents")
          .default(false),
      }),
    },
  );
}

export function makeMvTool(backend: ValidatingFilesystemBackend) {
  return tool(
    async ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
      const result = await backend.rename(oldPath, newPath);
      if (result.error) return JSON.stringify({ error: result.error });
      return JSON.stringify({ moved: { from: result.oldPath, to: result.newPath } });
    },
    {
      name: "mv",
      description:
        "Move a file or directory within the project filesystem. " +
        "Both paths must be absolute virtual paths within the project root.",
      schema: z.object({
        oldPath: z.string().describe("Current absolute virtual path of the file or directory"),
        newPath: z.string().describe("Desired absolute virtual path"),
      }),
    },
  );
}

export function makeCpTool(backend: ValidatingFilesystemBackend) {
  return tool(
    async ({ srcPath, destPath, recursive }: { srcPath: string; destPath: string; recursive: boolean }) => {
      const result = await backend.copy(srcPath, destPath, recursive);
      if (result.error) return JSON.stringify({ error: result.error });
      return JSON.stringify({ copied: { from: result.srcPath, to: result.destPath } });
    },
    {
      name: "cp",
      description:
        "Copy a file or directory within the project filesystem. " +
        "Set recursive to true to copy directories. " +
        "Both paths must be absolute virtual paths within the project root.",
      schema: z.object({
        srcPath: z.string().describe("Absolute virtual path of the source file or directory"),
        destPath: z.string().describe("Absolute virtual path for the copy destination"),
        recursive: z
          .boolean()
          .describe("If true, recursively copy directories and their contents")
          .default(false),
      }),
    },
  );
}

export function makeReadDocumentTool(projectId: string) {
  const docSvc = new DocumentFileService(getEnv().projectsDir);
  return tool(
    async ({ filename }: { filename: string }) => {
      if (!filename) {
        const docs = await docSvc.list(projectId);
        if (docs.length === 0) return "No documents have been uploaded to this project.";
        const lines = docs.map(
          (d) => `- ${d.filename} (${(d.size / 1024).toFixed(1)} KB, ${d.mimeType})`,
        );
        return `Available documents:\n${lines.join("\n")}`;
      }
      try {
        const md = await docSvc.readAsMarkdown(projectId, filename);
        return md;
      } catch {
        const docs = await docSvc.list(projectId);
        const names = docs.map((d) => d.filename);
        return `Document "${filename}" not found. Available documents: ${names.length > 0 ? names.join(", ") : "(none)"}`;
      }
    },
    {
      name: "read_document",
      description:
        "Read an uploaded document and return its content as markdown. " +
        "Pass a filename to read a specific document, or pass an empty string to list all available documents. " +
        "Supports PDF, DOCX, XLSX, CSV, TXT, MD, HTML, and more.",
      schema: z.object({
        filename: z
          .string()
          .describe("The filename of the document to read, or empty string to list available documents")
          .default(""),
      }),
    },
  );
}

export function makeListTestAgentsTool(projectId: string) {
  return tool(
    async () => {
      try {
        await connectDB();
        const agents = await TestAgent.find({ project: projectId })
          .select("name semanticModels llmModel")
          .lean();
        return JSON.stringify(
          agents.map((a) => ({
            id: (a as any)._id.toString(),
            name: a.name,
            semanticModels: a.semanticModels,
            llmModel: a.llmModel,
          })),
        );
      } catch (err: any) {
        console.error("[list_test_agents] Error:", err);
        return JSON.stringify({ error: err.message ?? "Failed to list test agents" });
      }
    },
    {
      name: "list_test_agents",
      description:
        "List all test agents configured for the current project. Returns each agent's id, " +
        "name, assigned semantic models, and LLM model. Use this before creating test cases " +
        "to check if an agent can be assigned.",
      schema: z.object({}),
    },
  );
}

export function makeListTestCasesTool(projectId: string) {
  return tool(
    async ({ semanticModel }: { semanticModel?: string }) => {
      try {
        await connectDB();
        const filter: Record<string, unknown> = { project: projectId };
        if (semanticModel) filter.semanticModel = semanticModel;
        const cases = await TestCase.find(filter)
          .select("title semanticModel inputMessage expectedFacts tags testAgent")
          .populate("testAgent", "name")
          .lean();
        return JSON.stringify(
          cases.map((c) => ({
            id: (c as any)._id.toString(),
            title: c.title,
            semanticModel: c.semanticModel,
            inputMessage: c.inputMessage,
            expectedFactsCount: c.expectedFacts.length,
            tags: c.tags,
            testAgent: c.testAgent ? { id: (c.testAgent as any)._id.toString(), name: (c.testAgent as any).name } : null,
          })),
        );
      } catch (err: any) {
        console.error("[list_test_cases] Error:", err);
        return JSON.stringify({ error: err.message ?? "Failed to list test cases" });
      }
    },
    {
      name: "list_test_cases",
      description:
        "List existing test cases for the current project. Optionally filter by semantic model name. " +
        "Use this to see what test coverage already exists before creating new test cases.",
      schema: z.object({
        semanticModel: z
          .string()
          .optional()
          .describe("Filter by semantic model name. Omit to list all test cases."),
      }),
    },
  );
}

export function makeDeleteTestCaseTool(projectId: string) {
  return tool(
    async ({ testCaseId }: { testCaseId: string }) => {
      try {
        await connectDB();
        const tc = await TestCase.findOne({ _id: testCaseId, project: projectId });
        if (!tc) {
          return JSON.stringify({ error: "Test case not found in this project" });
        }
        await tc.softDelete();
        return JSON.stringify({ deleted: { id: testCaseId, title: tc.title } });
      } catch (err: any) {
        console.error("[delete_test_case] Error:", err);
        return JSON.stringify({ error: err.message ?? "Failed to delete test case" });
      }
    },
    {
      name: "delete_test_case",
      description:
        "Soft-delete a test case by ID. Use list_test_cases first to find the ID. " +
        "The test case will no longer appear in listings or batch runs.",
      schema: z.object({
        testCaseId: z.string().describe("The ID of the test case to delete (from list_test_cases)"),
      }),
    },
  );
}

export function makeCreateTestCaseTool(projectId: string) {
  return tool(
    async ({
      title,
      semanticModel,
      inputMessage,
      expectedFacts,
      testAgentId,
    }: {
      title: string;
      semanticModel: string;
      inputMessage: string;
      expectedFacts: string[];
      testAgentId?: string;
    }) => {
      if (expectedFacts.length === 0) {
        return JSON.stringify({ error: "At least one expected fact is required" });
      }

      try {
        await connectDB();

        let testAgent: string | undefined;
        if (testAgentId) {
          const agent = await TestAgent.findOne({ _id: testAgentId, project: projectId }).lean();
          if (!agent) {
            return JSON.stringify({ error: "Test agent not found in this project" });
          }
          testAgent = testAgentId;
        }

        const tc = await TestCase.create({
          title,
          project: projectId,
          semanticModel,
          inputMessage,
          expectedFacts,
          tags: ["auto-generated"],
          ...(testAgent && { testAgent }),
        });
        return JSON.stringify({
          created: {
            id: tc._id.toString(),
            title: tc.title,
            semanticModel: tc.semanticModel,
            testAgent: testAgent ?? null,
            tags: tc.tags,
          },
        });
      } catch (err: any) {
        console.error("[create_test_case] Error:", err);
        return JSON.stringify({ error: err.message ?? "Failed to create test case" });
      }
    },
    {
      name: "create_test_case",
      description:
        "Create a test case for the current project. The test case captures a natural-language " +
        "question and the expected factual assertions that a test agent's response must satisfy. " +
        "Use this after completing a semantic model to generate a starter test suite. " +
        "The 'auto-generated' tag is added automatically. Optionally assign a test agent by ID " +
        "(use list_test_agents first to find available agents).",
      schema: z.object({
        title: z.string().describe("Short description of what is being tested"),
        semanticModel: z.string().describe("Name of the semantic model the test targets"),
        inputMessage: z.string().describe("Natural-language question to send to a test agent"),
        expectedFacts: z
          .array(z.string())
          .min(1)
          .describe("Factual assertions the agent's response must satisfy (min 1)"),
        testAgentId: z
          .string()
          .optional()
          .describe("ID of a test agent to assign (from list_test_agents). Omit to leave unassigned."),
      }),
    },
  );
}

export function makeRevertFileTool(projectDir: string) {
  const gitSvc = new GitService(projectDir);
  return tool(
    async ({ path: filePath }: { path: string }) => {
      try {
        const result = await gitSvc.revertFile(filePath);
        if (result.deleted) {
          return JSON.stringify({ reverted: filePath, action: "deleted (not in last commit)" });
        }
        return JSON.stringify({ reverted: filePath, action: "restored to last commit" });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : "Failed to revert file" });
      }
    },
    {
      name: "revert_file",
      description:
        "Restore a single file to its state at the last Git commit (HEAD). " +
        "Pass the relative path from the project root (e.g. 'src/sales.yaml'). " +
        "If the file does not exist in the last commit, it will be deleted from disk.",
      schema: z.object({
        path: z.string().describe("Relative path of the file to revert (from project root)"),
      }),
    },
  );
}

export function makeDiscardAllChangesTool(projectDir: string) {
  const gitSvc = new GitService(projectDir);
  return tool(
    async () => {
      try {
        await gitSvc.discardAllChanges();
        return JSON.stringify({ ok: true, message: "All uncommitted changes discarded" });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : "Failed to discard changes" });
      }
    },
    {
      name: "discard_all_changes",
      description:
        "Restore the entire working directory to the state at the last Git commit (HEAD). " +
        "All uncommitted modifications, additions, and deletions are reverted. " +
        "Use with caution — this removes all unsaved work.",
      schema: z.object({}),
    },
  );
}

export function buildConnectionContext(connections: IConnectionDocument[]): string {
  if (connections.length === 0) {
    return [
      "## Data Connections",
      "",
      "**No data connections are configured for this project.**",
      "",
      "The user must add at least one database connection before you can explore schemas or build a semantic model.",
      "Guide them to the project settings to add a connection (see step 0 in your workflow).",
    ].join("\n");
  }

  const schemaLines = connections.map((c) => {
    const dbSchema = c.connectionConfig.schema || null;
    const suffix = c.description ? `: ${c.description}` : "";
    if (dbSchema) {
      return `  - "${c.slug}" (${c.type}, schema "${dbSchema}") → qualify tables as ${c.slug}.${dbSchema}.<table>${suffix}`;
    }
    return `  - "${c.slug}" (${c.type})${suffix}`;
  });

  const hasSchemaConnections = connections.some((c) => c.connectionConfig.schema);

  return [
    "## Data Connections",
    "",
    "External databases are attached to DuckDB as **named catalogs**.",
    "For databases like PostgreSQL, MySQL, and MSSQL the original schema (e.g. \"public\") is preserved inside the catalog.",
    "You MUST always fully qualify table names: `catalog.schema.table` (or `catalog.table` for databases without schemas like SQLite).",
    "",
    "Available catalogs:",
    ...schemaLines,
    "",
    ...(hasSchemaConnections
      ? [
          "Example: to query a table `orders` in catalog `Shopify` with schema `public`, write:",
          "  SELECT * FROM Shopify.public.orders LIMIT 10",
        ]
      : [
          "Example: to query a table `orders` in catalog `Shopify`, write:",
          "  SELECT * FROM Shopify.orders LIMIT 10",
        ]),
    "",
    "NEVER query a table without its catalog prefix — unqualified names will fail.",
    "",
    "**READ-ONLY**: All queries are read-only. INSERT, UPDATE, DELETE, CREATE, DROP, and ALTER statements are forbidden and will be rejected.",
    "",
    "When testing a model you have authored, call `runModelQuery` with the model name and reference datasets by bare name.",
  ].join("\n");
}

export function buildSystemPrompt(connections: IConnectionDocument[]): string {
  return SEMANTIC_MODEL_AGENT_PROMPT + "\n\n" + buildConnectionContext(connections);
}
