import { tool } from "@langchain/core/tools";
import { z } from "zod/v4";
import { getEnv } from "../config/env";
import { Connection, TestCase, type IConnectionDocument } from "../models/index";
import { connectDB } from "../infra/db";
import { getProjectInstance } from "./duckdb";
import { validateReadOnlySQL } from "./sql-validation";
import { DocumentFileService } from "./document-files";
import { SEMANTIC_MODEL_AGENT_PROMPT } from "../prompts/index";
import type { ValidatingFilesystemBackend } from "./agent-filesystem";

function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? Number(v) : v,
  );
}

const MAX_ROWS = 1000;
const QUERY_TIMEOUT_MS = 30_000;

export function makeExecuteQueryTool(projectId: string) {
  return tool(
    async ({ sql, params }: { sql: string; params: unknown[] }) => {
      const violation = validateReadOnlySQL(sql);
      if (violation) {
        return JSON.stringify({ error: violation });
      }

      await connectDB();
      const connections = (await Connection.find({
        project: projectId,
        isActive: true,
      }).lean()) as IConnectionDocument[];

      const instance = await getProjectInstance(projectId, connections, { readOnly: true });
      const db = await instance.connect();

      try {
        const prepared = await db.prepare(sql);
        if (params.length > 0) {
          for (let i = 0; i < params.length; i++) {
            prepared.bindVarchar(i + 1, String(params[i]));
          }
        }

        const result = await Promise.race([
          prepared.run(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Query timed out after ${QUERY_TIMEOUT_MS / 1000}s`)), QUERY_TIMEOUT_MS),
          ),
        ]);

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
    },
    {
      name: "executeQuery",
      description:
        "Run a read-only SQL query against the project's DuckDB instance. " +
        "Only SELECT / WITH / EXPLAIN / DESCRIBE queries are allowed. " +
        "All database connections are attached as named catalogs — you MUST fully qualify every table as catalog.schema.table (e.g. Shopify.public.shopify_orders). " +
        "Use $1, $2, ... placeholders and provide values in the params array. " +
        "Results are limited to 1000 rows.",
      schema: z.object({
        sql: z.string().describe("SQL query with $1, $2, ... placeholders"),
        params: z.array(z.unknown()).describe("Parameter values for placeholders").default([]),
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
  const docSvc = new DocumentFileService(getEnv().ARCHSEM_DATA_DIR);
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

export function makeCreateTestCaseTool(projectId: string) {
  return tool(
    async ({
      title,
      semanticModel,
      inputMessage,
      expectedFacts,
    }: {
      title: string;
      semanticModel: string;
      inputMessage: string;
      expectedFacts: string[];
    }) => {
      if (expectedFacts.length === 0) {
        return JSON.stringify({ error: "At least one expected fact is required" });
      }

      try {
        await connectDB();
        const tc = await TestCase.create({
          title,
          project: projectId,
          semanticModel,
          inputMessage,
          expectedFacts,
          tags: ["auto-generated"],
        });
        return JSON.stringify({
          created: {
            id: tc._id.toString(),
            title: tc.title,
            semanticModel: tc.semanticModel,
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
        "The 'auto-generated' tag is added automatically.",
      schema: z.object({
        title: z.string().describe("Short description of what is being tested"),
        semanticModel: z.string().describe("Name of the semantic model the test targets"),
        inputMessage: z.string().describe("Natural-language question to send to a test agent"),
        expectedFacts: z
          .array(z.string())
          .min(1)
          .describe("Factual assertions the agent's response must satisfy (min 1)"),
      }),
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
  ].join("\n");
}

export function buildSystemPrompt(connections: IConnectionDocument[]): string {
  return SEMANTIC_MODEL_AGENT_PROMPT + "\n\n" + buildConnectionContext(connections);
}
