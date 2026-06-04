import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Loader2, Play, Terminal } from "lucide-react";
import {
  Button,
  Card,
  ScrollArea,
  Textarea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
} from "@archmax/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { useResizablePanel, PanelResizeHandle } from "@/components/layout/panel-resize-handle";

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

function CopyCommandButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={() => void handleCopy()}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function CommandBlock({ label, sql }: { label: string; sql: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <CopyCommandButton text={sql} />
      </div>
      <pre className="overflow-x-auto rounded-lg bg-card p-2 text-xs font-mono text-foreground/90 border border-border/60">
        {sql}
      </pre>
    </div>
  );
}

function FederationConsolePage() {
  const { project } = useProject();
  const [sql, setSql] = useState("SELECT 1");
  const [extensionSql, setExtensionSql] = useState("INSTALL spatial FROM community");
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const { width: panelWidth, onMouseDown: onResizeStart } = useResizablePanel(
    "archmax-duckdb-console-panel-width",
    320,
  );

  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ["duckdb-console", "setup", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["duckdb-console"].setup.$get({
        param: { projectId: project._id },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to load setup commands");
      }
      return res.json() as Promise<SetupResponse>;
    },
  });

  const hasConnections = (setup?.connections.length ?? 0) > 0;

  const runQuery = useMutation({
    mutationFn: async (query: string) => {
      const res = await api.api.projects[":projectId"]["duckdb-console"].query.$post({
        param: { projectId: project._id },
        json: { sql: query },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Query failed");
      }
      return res.json() as Promise<QueryResponse>;
    },
    onSuccess: (data) => {
      setQueryResult(data);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Query failed");
    },
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
      toast.success(`Extension ${data.extension} loaded`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Extension install failed");
    },
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-border/60 px-6">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold tracking-tight">Console</h1>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className="flex shrink-0 flex-col border-r border-border/60 bg-muted/30"
          style={{ width: panelWidth }}
        >
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-medium">Setup commands</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Copyable examples for extensions and attaches. Extensions installed here apply to
              this API process only until the instance is rebuilt.
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-5 p-4">
              {setupLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Pre-installed extensions
                    </h3>
                    {setup?.preinstalledExtensions.map((ext) => (
                      <CommandBlock
                        key={ext.name}
                        label={ext.name}
                        sql={`${ext.installSql};\n${ext.loadSql};`}
                      />
                    ))}
                  </div>

                  {setup && setup.connections.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Connection attach (redacted)
                      </h3>
                      {setup.connections.map((conn) => (
                        <CommandBlock
                          key={conn.slug}
                          label={`${conn.slug} (${conn.type})`}
                          sql={conn.attachSql}
                        />
                      ))}
                    </div>
                  )}

                  {setup?.exampleQuery && (
                    <CommandBlock label="Example query" sql={setup.exampleQuery} />
                  )}

                  <CommandBlock
                    label="Custom community extension"
                    sql={"INSTALL <name> FROM community;\nLOAD <name>;"}
                  />
                </>
              )}
            </div>
          </ScrollArea>
        </aside>

        <PanelResizeHandle onMouseDown={onResizeStart} />

        <main className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          {!hasConnections && !setupLoading && (
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

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="console-sql">
              SQL
            </label>
            <Textarea
              id="console-sql"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              className="min-h-[120px] font-mono text-sm"
              spellCheck={false}
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={() => runQuery.mutate(sql)}
                disabled={!hasConnections || runQuery.isPending}
              >
                {runQuery.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Run
              </Button>
              {setup?.exampleQuery && !setup.exampleQuery.startsWith("--") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSql(setup.exampleQuery)}
                  disabled={!hasConnections}
                >
                  Use example
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 bg-card p-4">
            <label className="text-sm font-medium" htmlFor="extension-sql">
              Install extension
            </label>
            <Textarea
              id="extension-sql"
              value={extensionSql}
              onChange={(e) => setExtensionSql(e.target.value)}
              className="min-h-[60px] font-mono text-sm"
              spellCheck={false}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => installExtension.mutate(extensionSql)}
              disabled={installExtension.isPending}
            >
              {installExtension.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Install / Load
            </Button>
          </div>

          {queryResult && (
            <div className="min-h-0 flex-1 space-y-2">
              <p className="text-xs text-muted-foreground">
                {queryResult.rowCount} row{queryResult.rowCount === 1 ? "" : "s"} in{" "}
                {queryResult.durationMs} ms
              </p>
              <div className="overflow-auto rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {queryResult.columns.map((col) => (
                        <TableHead key={col}>{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queryResult.rows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={queryResult.columns.length || 1}
                          className="text-muted-foreground"
                        >
                          No rows
                        </TableCell>
                      </TableRow>
                    ) : (
                      queryResult.rows.map((row, i) => (
                        <TableRow key={i}>
                          {queryResult.columns.map((col) => (
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
        </main>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
