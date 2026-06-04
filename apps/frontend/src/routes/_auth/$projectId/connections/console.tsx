import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Play } from "lucide-react";
import {
  Button,
  Card,
  Textarea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@archmax/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

export const Route = createFileRoute("/_auth/$projectId/connections/console")({
  component: FederationConsolePage,
});

interface SetupResponse {
  preinstalledExtensions: Array<{ name: string; installSql: string; loadSql: string }>;
  connections: Array<{ slug: string; type: string; attachSql: string }>;
  exampleQuery: string;
}

interface QueryResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

function isExtensionStatement(sql: string): boolean {
  return /^\s*(install|load)\b/i.test(sql);
}

function FederationConsolePage() {
  const { project } = useProject();
  const [sql, setSql] = useState("SELECT 1");
  const [result, setResult] = useState<QueryResponse | null>(null);

  const { data: setup } = useQuery({
    queryKey: ["duckdb-console", "setup", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["duckdb-console"].setup.$get({
        param: { projectId: project._id },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to load console setup");
      }
      return res.json() as Promise<SetupResponse>;
    },
  });

  const hasConnections = (setup?.connections.length ?? 0) > 0;

  const runQuery = useMutation({
    mutationFn: async (statement: string) => {
      const res = await api.api.projects[":projectId"]["duckdb-console"].query.$post({
        param: { projectId: project._id },
        json: { sql: statement },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Query failed");
      }
      return res.json() as Promise<QueryResponse>;
    },
    onSuccess: (data) => setResult(data),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Query failed"),
  });

  const installExtension = useMutation({
    mutationFn: async (statement: string) => {
      const res = await api.api.projects[":projectId"]["duckdb-console"].extensions.$post({
        param: { projectId: project._id },
        json: { sql: statement },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Extension install failed");
      }
      return res.json() as Promise<{ ok: boolean; extension: string }>;
    },
    onSuccess: (data) => {
      setResult(null);
      toast.success(`Extension ${data.extension} loaded`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Extension install failed"),
  });

  const isRunning = runQuery.isPending || installExtension.isPending;

  function handleRun() {
    const statement = sql.trim();
    if (!statement) return;
    if (isExtensionStatement(statement)) {
      installExtension.mutate(statement);
    } else {
      runQuery.mutate(statement);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="content-tight">
            <h1 className="text-heading text-2xl">Console</h1>
            <p className="text-subtle text-sm">
              Run read-only SQL across the {project.title} federation, or install DuckDB
              extensions with <code className="font-mono">INSTALL</code> /{" "}
              <code className="font-mono">LOAD</code>.
            </p>
          </div>
          <Button onClick={handleRun} disabled={!hasConnections || isRunning}>
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-8 pb-8">
        {!hasConnections && setup && (
          <Card className="border-dashed p-4 text-sm text-muted-foreground">
            No active connections. Add and activate connections under{" "}
            <Link
              to="/$projectId/connections"
              params={{ projectId: project._id }}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Data Sources
            </Link>{" "}
            before running federation queries.
          </Card>
        )}

        <Textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleRun();
            }
          }}
          placeholder="SELECT 1"
          className="min-h-[140px] shrink-0 font-mono text-sm"
          spellCheck={false}
        />

        {result && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <p className="text-subtle text-xs tabular-nums">
              {result.rowCount} row{result.rowCount === 1 ? "" : "s"} in {result.durationMs} ms
            </p>
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {result.columns.map((col) => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={result.columns.length || 1}
                        className="text-muted-foreground"
                      >
                        No rows
                      </TableCell>
                    </TableRow>
                  ) : (
                    result.rows.map((row, i) => (
                      <TableRow key={i}>
                        {result.columns.map((col) => (
                          <TableCell key={col} className="font-mono text-xs">
                            {formatCell(row[col])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
