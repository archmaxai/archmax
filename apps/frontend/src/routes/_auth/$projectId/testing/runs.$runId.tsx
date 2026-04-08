import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
} from "@semlayer/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

export const Route = createFileRoute(
  "/_auth/$projectId/testing/runs/$runId",
)({
  component: TestRunDetailPage,
});

interface FactResult {
  fact: string;
  passed: boolean;
  reasoning: string;
}

interface ToolCall {
  id: string;
  name: string;
  args: string;
  result?: string;
  status?: string;
}

interface CaseResult {
  title: string;
  semanticModel: string;
  inputMessage: string;
  expectedFacts: string[];
  maxToolCalls?: number;
  status: string;
  agentResponse: string;
  toolCalls: ToolCall[];
  factResults: FactResult[];
  durationMs: number;
  errorMessage?: string;
}

interface TestRunDetail {
  _id: string;
  testAgent: { _id: string; name: string } | null;
  status: string;
  cases: CaseResult[];
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const PAGE_SIZE = 25;

function TestRunDetailPage() {
  const { project } = useProject();
  const { runId } = Route.useParams();
  const [page, setPage] = useState(1);
  const [expandedCases, setExpandedCases] = useState<Set<number>>(new Set());

  const { data: run } = useQuery<TestRunDetail>({
    queryKey: ["test-run", runId],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-runs"][":runId"].$get({
        param: { projectId: project._id, runId },
      });
      if (!res.ok) throw new Error("Failed to load test run");
      return res.json() as Promise<TestRunDetail>;
    },
    refetchInterval: (query) =>
      query.state.data?.status === "running" || query.state.data?.status === "pending" ? 3000 : false,
  });

  const cases = run?.cases ?? [];
  const totalCases = cases.length;
  const totalPages = Math.max(1, Math.ceil(totalCases / PAGE_SIZE));
  const pagedCases = cases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const globalOffset = (page - 1) * PAGE_SIZE;

  const passed = cases.filter((c) => c.status === "passed").length;
  const failed = cases.filter((c) => c.status === "failed").length;
  const errors = cases.filter((c) => c.status === "error").length;
  const pending = cases.filter((c) => c.status === "pending" || c.status === "running").length;

  function toggleExpand(globalIndex: number) {
    setExpandedCases((prev) => {
      const next = new Set(prev);
      if (next.has(globalIndex)) next.delete(globalIndex);
      else next.add(globalIndex);
      return next;
    });
  }

  function caseStatusIcon(status: string) {
    switch (status) {
      case "passed": return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
      case "error": return <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />;
      case "running": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  }

  function runStatusBadge(status: string) {
    switch (status) {
      case "completed": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Completed</Badge>;
      case "failed": return <Badge variant="destructive">Failed</Badge>;
      case "running": return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Running</Badge>;
      case "pending": return <Badge variant="outline">Pending</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <div className="flex items-center gap-4">
          <Link
            to="/$projectId/testing/runs"
            params={{ projectId: project._id }}
          >
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="content-tight flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-heading text-2xl">Test Run</h1>
              {run && runStatusBadge(run.status)}
            </div>
            {run && (
              <p className="text-subtle text-sm">
                Agent: {run.testAgent?.name ?? "—"}
                {run.startedAt && <> · Started {new Date(run.startedAt).toLocaleString()}</>}
                {run.completedAt && <> · Completed {new Date(run.completedAt).toLocaleString()}</>}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex-1 overflow-y-auto p-8 space-y-4">
        {run && (
          <div className="flex gap-3 flex-wrap">
            {passed > 0 && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                {passed} passed
              </Badge>
            )}
            {failed > 0 && (
              <Badge variant="destructive">{failed} failed</Badge>
            )}
            {errors > 0 && (
              <Badge variant="outline">{errors} errors</Badge>
            )}
            {pending > 0 && (
              <Badge variant="outline">{pending} pending</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {totalCases} total cases
            </span>
          </div>
        )}

        {!run ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {pagedCases.map((tc, i) => {
              const globalIndex = globalOffset + i;
              const isExpanded = expandedCases.has(globalIndex);
              return (
                <Card key={globalIndex} className="p-4 space-y-3">
                  <button
                    onClick={() => toggleExpand(globalIndex)}
                    className="flex items-start gap-3 w-full text-left"
                  >
                    {caseStatusIcon(tc.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{tc.title}</span>
                        <Badge variant="secondary" className="text-xs">{tc.semanticModel}</Badge>
                        {tc.maxToolCalls && (
                          <Badge variant="outline" className="text-xs">max {tc.maxToolCalls} tools</Badge>
                        )}
                        {tc.durationMs > 0 && (
                          <span className="text-xs text-muted-foreground">{(tc.durationMs / 1000).toFixed(1)}s</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{tc.inputMessage}</p>
                    </div>
                    {isExpanded
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                  </button>

                  {isExpanded && (
                    <div className="space-y-3 pl-7">
                      {tc.errorMessage && (
                        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                          {tc.errorMessage}
                        </div>
                      )}

                      {tc.agentResponse && (
                        <div className="rounded-md bg-muted p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Agent Response</p>
                          <p className="text-sm whitespace-pre-wrap">{tc.agentResponse}</p>
                        </div>
                      )}

                      {tc.toolCalls.length > 0 && (
                        <div className="rounded-md bg-muted p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Tool Calls ({tc.toolCalls.length})
                          </p>
                          <div className="space-y-1.5">
                            {tc.toolCalls.map((tool, j) => (
                              <div key={j} className="text-sm flex items-start gap-2">
                                <Badge variant="outline" className="text-xs shrink-0 mt-0.5">{tool.name}</Badge>
                                {tool.result && (
                                  <span className="text-xs text-muted-foreground truncate">{tool.result.slice(0, 120)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {tc.factResults.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Fact Evaluation</p>
                          {tc.factResults.map((fr, j) => (
                            <div key={j} className="flex items-start gap-2 text-sm">
                              {fr.passed ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                              )}
                              <div>
                                <span className="font-medium">{fr.fact}</span>
                                {fr.reasoning && (
                                  <p className="text-xs text-muted-foreground">{fr.reasoning}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {totalCases} total cases
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
      </div>
    </div>
  );
}
