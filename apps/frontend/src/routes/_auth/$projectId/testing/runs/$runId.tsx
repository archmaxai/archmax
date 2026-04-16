import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Wand2,
  Square,
  Wrench,
  Timer,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@archmax/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { MarkdownContent } from "@/components/chat/markdown-components";

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

function buildRefinePrompt(tc: CaseResult): string {
  let prompt = `A test case against the semantic model "${tc.semanticModel}" had execution issues.\n\n`;
  prompt += `**Question asked:** ${tc.inputMessage}\n\n`;

  if (tc.errorMessage) {
    prompt += `**Error:** ${tc.errorMessage}\n\n`;
  }
  if (tc.toolCalls.length > 0) {
    prompt += `**Tool calls made (${tc.toolCalls.length}):**\n`;
    const toolSummary = tc.toolCalls
      .map((t) => {
        let line = `- \`${t.name}\``;
        if (t.args) line += ` args: ${t.args}`;
        if (t.result) {
          const teaser = t.result.length > 200 ? t.result.slice(0, 200) + "..." : t.result;
          line += `\n  output: ${teaser}`;
        }
        return line;
      })
      .join("\n");
    prompt += `${toolSummary}\n\n`;
  }
  if (tc.agentResponse) {
    const truncated = tc.agentResponse.length > 500
      ? tc.agentResponse.slice(0, 500) + "..."
      : tc.agentResponse;
    prompt += `**Agent response:** ${truncated}\n\n`;
  }

  if (tc.factResults.length > 0) {
    prompt += `**Fact check results (${tc.factResults.filter((f) => f.passed).length}/${tc.factResults.length} passed):**\n`;
    for (const fr of tc.factResults) {
      const icon = fr.passed ? "✅" : "❌";
      prompt += `${icon} ${fr.fact}`;
      if (fr.reasoning) prompt += ` — ${fr.reasoning}`;
      prompt += "\n";
    }
    prompt += "\n";
  }

  prompt += "The agent struggled with this query. Please review the semantic model and refine it to be easier to navigate: improve ai_context descriptions, simplify dataset/field naming, add missing relationships, or reorganize the structure so the agent can answer more efficiently with fewer tool calls.";
  return prompt;
}

function TestRunDetailPage() {
  const { project } = useProject();
  const { runId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "pending" ? 3000 : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await api.api.projects[":projectId"]["test-runs"][":runId"].cancel.$post({
        param: { projectId: project._id, runId },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as any)?.message ?? "Failed to cancel test run");
      }
    },
    onSuccess: () => {
      toast.success("Test run cancelled");
      queryClient.invalidateQueries({ queryKey: ["test-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["test-runs", project._id] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to cancel test run");
    },
  });

  const cases = run?.cases ?? [];
  const totalCases = cases.length;
  const totalPages = Math.max(1, Math.ceil(totalCases / PAGE_SIZE));
  const pagedCases = cases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const globalOffset = (page - 1) * PAGE_SIZE;

  const passed = cases.filter((c) => c.status === "passed").length;
  const failed = cases.filter((c) => c.status === "failed").length;
  const errors = cases.filter((c) => c.status === "error").length;

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
      case "cancelled": return <Ban className="h-4 w-4 text-muted-foreground shrink-0" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  }

  function runStatusBadge(status: string) {
    switch (status) {
      case "completed": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Completed</Badge>;
      case "failed": return <Badge variant="destructive">Failed</Badge>;
      case "running": return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Running</Badge>;
      case "pending": return <Badge variant="outline">Pending</Badge>;
      case "cancelled": return <Badge variant="secondary">Cancelled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  }

  const isActive = run?.status === "running" || run?.status === "pending";

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/$projectId/testing/runs"
              params={{ projectId: project._id }}
            >
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="content-tight">
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
          {isActive && (
            <Button
              variant="default"
              size="sm"
              className="gap-1.5"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              Cancel Run
            </Button>
          )}
        </div>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex-1 overflow-y-auto p-8 space-y-4">
        {run && (
          <div className="grid gap-4 grid-cols-3">
            <Card className="py-0">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <FlaskConical className="h-4 w-4" />
                  <span className="text-sm">Total</span>
                </div>
                <div className="text-2xl font-semibold">{totalCases}</div>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm">Passed</span>
                </div>
                <div className="text-2xl font-semibold">{passed}</div>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-1">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm">Failed</span>
                </div>
                <div className="text-2xl font-semibold">{failed + errors}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {!run ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {pagedCases.map((tc, i) => {
              const globalIndex = globalOffset + i;
              const isExpanded = expandedCases.has(globalIndex);
              return (
                <Card key={globalIndex} className="p-0 gap-0">
                  <button
                    onClick={() => toggleExpand(globalIndex)}
                    className="flex items-center gap-3 w-full text-left px-5 py-3.5"
                  >
                    {caseStatusIcon(tc.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{tc.title}</span>
                        <Badge variant="secondary" className="text-xs">{tc.semanticModel}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">{tc.inputMessage}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {tc.toolCalls.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                          <Wrench className="h-3 w-3" />
                          {tc.toolCalls.length}
                        </span>
                      )}
                      {tc.durationMs > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                          <Timer className="h-3 w-3" />
                          {(tc.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-5 pb-4 pt-3">
                      {tc.errorMessage && (
                        <div className="error-banner mb-3">
                          {tc.errorMessage}
                        </div>
                      )}

                      <Tabs
                        defaultValue={
                          tc.factResults.length > 0 ? "facts"
                            : tc.agentResponse ? "response"
                            : "tools"
                        }
                        className="gap-3"
                      >
                        <TabsList variant="pill">
                          {tc.agentResponse && (
                            <TabsTrigger value="response">Response</TabsTrigger>
                          )}
                          {tc.toolCalls.length > 0 && (
                            <TabsTrigger value="tools">
                              Tool Calls ({tc.toolCalls.length})
                            </TabsTrigger>
                          )}
                          {tc.factResults.length > 0 && (
                            <TabsTrigger value="facts">
                              Facts ({tc.factResults.length})
                            </TabsTrigger>
                          )}
                        </TabsList>

                        {tc.agentResponse && (
                          <TabsContent value="response">
                            <MarkdownContent content={tc.agentResponse} className="text-sm" />
                          </TabsContent>
                        )}

                        {tc.toolCalls.length > 0 && (
                          <TabsContent value="tools">
                            <Card className="p-0 gap-0">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-40">Tool</TableHead>
                                    <TableHead>Args</TableHead>
                                    <TableHead>Output</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {tc.toolCalls.map((tool, j) => (
                                    <TableRow key={j}>
                                      <TableCell>
                                        <code className="text-xs font-mono">{tool.name}</code>
                                      </TableCell>
                                      <TableCell className="max-w-60 text-sm text-muted-foreground">
                                        {tool.args ? (
                                          <span className="line-clamp-2 break-all font-mono text-xs">{tool.args}</span>
                                        ) : (
                                          <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="max-w-80 text-sm text-muted-foreground">
                                        {tool.result ? (
                                          <span className="line-clamp-2 break-all text-xs">{tool.result}</span>
                                        ) : (
                                          <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </Card>
                          </TabsContent>
                        )}

                        {tc.factResults.length > 0 && (
                          <TabsContent value="facts">
                            <div className="grid gap-1.5">
                              {tc.factResults.map((fr, j) => (
                                <div key={j} className="flex items-start gap-2">
                                  {fr.passed ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                  )}
                                  <div>
                                    <p className="text-sm font-medium">{fr.fact}</p>
                                    {fr.reasoning && (
                                      <p className="text-sm text-muted-foreground">{fr.reasoning}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TabsContent>
                        )}
                      </Tabs>

                      {(tc.status === "passed" || tc.status === "failed" || tc.status === "error") && (
                        <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({
                                to: "/$projectId/models/chat/$conversationId",
                                params: { projectId: project._id, conversationId: "new" },
                                search: { prefill: buildRefinePrompt(tc) },
                              });
                            }}
                          >
                            <Wand2 className="h-3.5 w-3.5" />
                            Refine
                          </Button>
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
