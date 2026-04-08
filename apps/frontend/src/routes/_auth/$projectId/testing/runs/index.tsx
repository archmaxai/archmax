import { useState, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Play,
} from "lucide-react";
import {
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@archsem/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { RunBatchDialog } from "@/components/testing/run-batch-dialog";
import type { TestAgentItem, SemanticModelSummary } from "@/components/testing/types";

export const Route = createFileRoute("/_auth/$projectId/testing/runs/")({
  component: TestRunsPage,
});

interface TestRunSummary {
  _id: string;
  testAgent: { _id: string; name: string } | null;
  status: string;
  caseCount: number;
  passed: number;
  failed: number;
  errors: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface TestRunsResponse {
  items: TestRunSummary[];
  total: number;
  page: number;
  limit: number;
}

const PAGE_SIZE = 25;

function TestRunsPage() {
  const { project } = useProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [runDialogOpen, setRunDialogOpen] = useState(false);

  const { data: agents = [] } = useQuery<TestAgentItem[]>({
    queryKey: ["test-agents", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-agents"].$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to load agents");
      return res.json() as Promise<TestAgentItem[]>;
    },
  });

  const { data: models = [] } = useQuery<SemanticModelSummary[]>({
    queryKey: ["semantic-models", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["semantic-models"].$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to load models");
      return res.json() as Promise<SemanticModelSummary[]>;
    },
  });

  const handleBatchSuccess = useCallback((runId: string) => {
    setRunDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["test-runs", project._id] });
    navigate({
      to: "/$projectId/testing/runs/$runId",
      params: { projectId: project._id, runId },
    });
  }, [navigate, project._id, queryClient]);

  const { data } = useQuery<TestRunsResponse>({
    queryKey: ["test-runs", project._id, page],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-runs"].$get({
        param: { projectId: project._id },
        query: { page: String(page), limit: String(PAGE_SIZE) },
      });
      if (!res.ok) throw new Error("Failed to load test runs");
      return res.json() as Promise<TestRunsResponse>;
    },
    refetchInterval: (query) => {
      const items = query.state.data?.items;
      if (items?.some((r) => r.status === "running" || r.status === "pending")) return 3_000;
      return 10_000;
    },
  });

  const runs = data?.items ?? [];
  const totalRuns = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRuns / PAGE_SIZE));

  function statusIcon(status: string) {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      case "running": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "pending": return <Clock className="h-4 w-4 text-muted-foreground" />;
      default: return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="content-tight">
            <h1 className="text-heading text-2xl">Test Runs</h1>
            <p className="text-subtle text-sm">
              View batch test run history and results.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setRunDialogOpen(true)}>
            <Play className="h-4 w-4" />
            Run Batch
          </Button>
        </div>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex-1 overflow-y-auto p-8 space-y-4">
        {totalRuns === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <FlaskConical className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No test runs yet. Start a batch run from the Test Cases page.
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Agent</TableHead>
                    <TableHead>Cases</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r._id} className="cursor-pointer">
                      <TableCell>{statusIcon(r.status)}</TableCell>
                      <TableCell>
                        <Link
                          to="/$projectId/testing/runs/$runId"
                          params={{ projectId: project._id, runId: r._id }}
                          className="font-medium hover:underline"
                        >
                          {r.testAgent?.name ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell>{r.caseCount}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3 text-sm">
                          {r.passed > 0 && (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {r.passed}
                            </span>
                          )}
                          {r.failed > 0 && (
                            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                              <XCircle className="h-3.5 w-3.5" />
                              {r.failed}
                            </span>
                          )}
                          {r.errors > 0 && (
                            <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {r.errors}
                            </span>
                          )}
                          {r.status === "running" && r.passed === 0 && r.failed === 0 && r.errors === 0 && (
                            <span className="text-sm text-muted-foreground">Running…</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {totalRuns} total runs
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

      <RunBatchDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        projectId={project._id}
        agents={agents}
        models={models}
        onSuccess={handleBatchSuccess}
      />
    </div>
  );
}
