import { resolve, relative, isAbsolute } from "node:path";
import { rm, lstat } from "node:fs/promises";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import yaml from "js-yaml";
import { getEnv } from "../config/env";
import { getProjectInstance } from "./duckdb";
import { Connection, Project, type IConnectionDocument } from "../models/index";
import { connectDB } from "../infra/db";
import { SEMANTIC_MODEL_AGENT_PROMPT } from "../prompts/index";
import { validateReadOnlySQL } from "./sql-validation";
export { validateReadOnlySQL } from "./sql-validation";
import { tool } from "@langchain/core/tools";
import { z } from "zod/v4";
import { DocumentFileService } from "./document-files";

const YAML_EXT = /\.ya?ml$/i;

export class ValidatingFilesystemBackend extends FilesystemBackend {
  /**
   * Replicate FilesystemBackend's private resolvePath for use in extended
   * operations (like delete) that the upstream protocol doesn't provide.
   */
  protected resolveVirtualPath(key: string): string {
    if (this.virtualMode) {
      const vpath = key.startsWith("/") ? key : "/" + key;
      if (vpath.includes("..") || vpath.startsWith("~"))
        throw new Error("Path traversal not allowed");
      const full = resolve(this.cwd, vpath.substring(1));
      const rel = relative(this.cwd, full);
      if (rel.startsWith("..") || isAbsolute(rel))
        throw new Error(`Path outside root directory`);
      return full;
    }
    if (isAbsolute(key)) return key;
    return resolve(this.cwd, key);
  }

  async delete(
    filePath: string,
    recursive = false,
  ): Promise<{ error?: string; path?: string }> {
    try {
      const resolved = this.resolveVirtualPath(filePath);
      const stat = await lstat(resolved);
      if (stat.isSymbolicLink())
        return { error: `Symlinks are not allowed: ${filePath}` };
      if (stat.isDirectory() && !recursive)
        return { error: `'${filePath}' is a directory — set recursive to true to delete it.` };
      await rm(resolved, { recursive });
      return { path: filePath };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ENOENT"))
        return { error: `'${filePath}' not found` };
      return { error: `Error deleting '${filePath}': ${msg}` };
    }
  }

  override async write(
    filePath: string,
    content: string,
  ): Promise<{ error?: string; path?: string; filesUpdate?: Record<string, unknown> | null }> {
    if (YAML_EXT.test(filePath)) {
      try {
        yaml.load(content);
      } catch (err) {
        const msg = err instanceof yaml.YAMLException ? err.message : String(err);
        return { error: `YAML syntax error: ${msg}` };
      }
    }
    return super.write(filePath, content);
  }

  override async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll?: boolean,
  ): Promise<{
    error?: string;
    path?: string;
    filesUpdate?: Record<string, unknown> | null;
    occurrences?: number;
    metadata?: Record<string, unknown>;
  }> {
    const result = await super.edit(filePath, oldString, newString, replaceAll);
    if (result.error || !YAML_EXT.test(filePath)) return result;

    try {
      const raw = await this.readRaw(filePath);
      yaml.load(raw.content.join("\n"));
    } catch (err) {
      const msg = err instanceof yaml.YAMLException ? err.message : String(err);
      return { ...result, error: `YAML syntax error after edit: ${msg}` };
    }
    return result;
  }
}

function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? Number(v) : v,
  );
}

const SAFE_PROJECT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const MAX_ROWS = 1000;
const QUERY_TIMEOUT_MS = 30_000;

function makeExecuteQueryTool(projectId: string) {
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

function makeDeleteTool(backend: ValidatingFilesystemBackend) {
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

function makeReadDocumentTool(projectId: string) {
  const docSvc = new DocumentFileService(getEnv().SEMLAYER_DATA_DIR);
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

function buildConnectionContext(connections: IConnectionDocument[]): string {
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

function buildSystemPrompt(connections: IConnectionDocument[]): string {
  return SEMANTIC_MODEL_AGENT_PROMPT + "\n\n" + buildConnectionContext(connections);
}

export async function createSemlayerAgent(projectId: string): Promise<ReturnType<typeof createDeepAgent>> {
  if (!SAFE_PROJECT_ID.test(projectId)) {
    throw new Error("Invalid projectId");
  }
  const env = getEnv();
  const dataDir = resolve(env.SEMLAYER_DATA_DIR, projectId);

  await connectDB();
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const connections = (await Connection.find({
    project: projectId,
    isActive: true,
  }).lean()) as IConnectionDocument[];

  const llm = new ChatOpenAI({
    model: env.AGENT_MODEL,
    apiKey: env.AGENT_API_KEY,
    configuration: {
      baseURL: env.AGENT_API_BASE_URL,
    },
  });

  const backend = new ValidatingFilesystemBackend({
    rootDir: dataDir,
    virtualMode: true,
  });

  const executeQuery = makeExecuteQueryTool(projectId);
  const rmTool = makeDeleteTool(backend);
  const readDocTool = makeReadDocumentTool(projectId);

  const agent = createDeepAgent({
    model: llm,
    backend,
    tools: [executeQuery, rmTool, readDocTool],
    systemPrompt: buildSystemPrompt(connections),
  });

  return agent;
}
