import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Switch,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  ScrollArea,
} from "@semlayer/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

export const Route = createFileRoute("/_auth/$projectId/monitoring")({
  component: MonitoringPage,
});

interface McpLogEntry {
  _id: string;
  tokenName: string;
  method: string;
  toolName: string | null;
  inputArgs: Record<string, unknown> | null;
  outputContent: string | null;
  durationMs: number;
  isError: boolean;
  errorMessage: string | null;
  clientIp: string;
  createdAt: string;
}

interface McpLogsResponse {
  data: McpLogEntry[];
  total: number;
  page: number;
  limit: number;
}

const PAGE_SIZE = 50;

function MonitoringPage() {
  const { project } = useProject();
  const [page, setPage] = useState(1);
  const [showListCalls, setShowListCalls] = useState(false);
  const [selectedLog, setSelectedLog] = useState<McpLogEntry | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<McpLogsResponse>({
    queryKey: ["mcp-logs", project._id, page],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["mcp-logs"].$get({
        param: { projectId: project._id },
        query: { page: String(page), limit: String(PAGE_SIZE) },
      });
      if (!res.ok) throw new Error("Failed to load MCP logs");
      return res.json() as Promise<McpLogsResponse>;
    },
    refetchInterval: 10_000,
  });

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filteredLogs = showListCalls
    ? logs
    : logs.filter((l) => l.method !== "tools/list");

  function formatTimestamp(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatDuration(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="content-tight">
            <h1 className="text-heading text-2xl">MCP Log</h1>
            <p className="text-subtle text-sm">
              MCP tool call log for AI agent activity.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="show-list"
                checked={showListCalls}
                onCheckedChange={setShowListCalls}
              />
              <Label htmlFor="show-list" className="text-sm text-muted-foreground">
                Show list calls
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex-1 overflow-y-auto p-8 space-y-4">
        {isLoading ? (
          <Card className="flex items-center justify-center p-12">
            <p className="text-sm text-muted-foreground">Loading logs...</p>
          </Card>
        ) : filteredLogs.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <Activity className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "No MCP calls recorded yet. Logs appear here when AI agents use this project's MCP endpoint."
                : "No matching calls. Try enabling \"Show list calls\" above."}
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Tool</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow
                      key={log._id}
                      className="cursor-pointer"
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell className="py-2 text-muted-foreground text-xs font-mono whitespace-nowrap">
                        {formatTimestamp(log.createdAt)}
                      </TableCell>
                      <TableCell className="py-2 text-sm">
                        {log.tokenName}
                      </TableCell>
                      <TableCell className="py-2">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {log.toolName ?? log.method}
                        </code>
                      </TableCell>
                      <TableCell className="py-2 text-right text-xs text-muted-foreground font-mono">
                        {formatDuration(log.durationMs)}
                      </TableCell>
                      <TableCell className="py-2">
                        {log.isError ? (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Error
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {total} total entries
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={!!selectedLog} onOpenChange={(open) => { if (!open) setSelectedLog(null); }}>
        <SheetContent side="right" className="sm:max-w-xl w-full">
          {selectedLog && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <code className="text-sm font-normal bg-muted px-1.5 py-0.5 rounded">
                    {selectedLog.toolName ?? selectedLog.method}
                  </code>
                  {selectedLog.isError ? (
                    <Badge variant="destructive" className="text-xs">Error</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">OK</Badge>
                  )}
                </SheetTitle>
                <SheetDescription>
                  {formatTimestamp(selectedLog.createdAt)} &middot; {selectedLog.tokenName} &middot; {formatDuration(selectedLog.durationMs)} &middot; {selectedLog.clientIp}
                </SheetDescription>
              </SheetHeader>

              <ScrollArea className="flex-1 min-h-0 px-4">
                <div className="space-y-4 pb-4">
                  {selectedLog.inputArgs && Object.keys(selectedLog.inputArgs).length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Input Arguments
                      </h4>
                      <pre className="text-xs font-mono bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(selectedLog.inputArgs, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Output
                    </h4>
                    <pre className="text-xs font-mono bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                      {selectedLog.outputContent ?? "—"}
                    </pre>
                  </div>

                  {selectedLog.isError && selectedLog.errorMessage && (
                    <div>
                      <h4 className="text-xs font-medium text-destructive uppercase tracking-wide mb-2">
                        Error Message
                      </h4>
                      <pre className="text-xs font-mono bg-destructive/10 text-destructive rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                        {selectedLog.errorMessage}
                      </pre>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
