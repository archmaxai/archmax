import { useState, useMemo, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  ClipboardList,
  X,
  ChevronLeft,
  ChevronRight,
  Tag,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@archmax/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { CaseFormDialog } from "@/components/testing/case-form-dialog";
import { RunBatchDialog } from "@/components/testing/run-batch-dialog";
import {
  ALL_FILTER,
  type TestCaseItem,
  type TestAgentItem,
  type SemanticModelSummary,
  type TestCasesResponse,
} from "@/components/testing/types";

export const Route = createFileRoute("/_auth/$projectId/testing/cases")({
  component: TestCasesPage,
});

const PAGE_SIZE = 25;

function TestCasesPage() {
  const { project } = useProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editCase, setEditCase] = useState<TestCaseItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TestCaseItem | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [page, setPage] = useState(1);

  const [filterAgent, setFilterAgent] = useState(ALL_FILTER);
  const [filterModel, setFilterModel] = useState(ALL_FILTER);
  const [filterTag, setFilterTag] = useState(ALL_FILTER);

  const query: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
  if (filterAgent !== ALL_FILTER) query.agentId = filterAgent;
  if (filterModel !== ALL_FILTER) query.semanticModel = filterModel;
  if (filterTag !== ALL_FILTER) query.tags = filterTag;

  const { data: casesData } = useQuery<TestCasesResponse>({
    queryKey: ["test-cases", project._id, page, filterAgent, filterModel, filterTag],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-cases"].$get({
        param: { projectId: project._id },
        query,
      });
      if (!res.ok) throw new Error("Failed to load test cases");
      return res.json() as unknown as Promise<TestCasesResponse>;
    },
  });

  const cases = casesData?.items ?? [];
  const totalCases = casesData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCases / PAGE_SIZE));

  const { data: agents = [] } = useQuery<TestAgentItem[]>({
    queryKey: ["test-agents", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-agents"].$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to load agents");
      return res.json() as unknown as Promise<TestAgentItem[]>;
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

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const tc of cases) {
      for (const t of tc.tags ?? []) set.add(t);
    }
    return Array.from(set).sort();
  }, [cases]);

  const hasFilters = filterAgent !== ALL_FILTER || filterModel !== ALL_FILTER || filterTag !== ALL_FILTER;

  function resetFilters() { setFilterAgent(ALL_FILTER); setFilterModel(ALL_FILTER); setFilterTag(ALL_FILTER); setPage(1); }
  function setFilterAgentAndReset(v: string) { setFilterAgent(v); setPage(1); }
  function setFilterModelAndReset(v: string) { setFilterModel(v); setPage(1); }
  function setFilterTagAndReset(v: string) { setFilterTag(v); setPage(1); }

  const deleteMutation = useMutation({
    mutationFn: async (caseId: string) => {
      const res = await api.api.projects[":projectId"]["test-cases"][":caseId"].$delete({
        param: { projectId: project._id, caseId },
      });
      if (!res.ok) throw new Error("Failed to delete test case");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-cases", project._id] });
      toast.success("Test case deleted");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleBatchSuccess = useCallback((runId: string) => {
    setRunDialogOpen(false);
    navigate({
      to: "/$projectId/testing/runs/$runId",
      params: { projectId: project._id, runId },
    });
  }, [navigate, project._id]);

  const handleRunNavigate = useCallback((runId: string) => {
    navigate({
      to: "/$projectId/testing/runs/$runId",
      params: { projectId: project._id, runId },
    });
  }, [navigate, project._id]);

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="content-tight">
            <h1 className="text-heading text-2xl">Test Cases</h1>
            <p className="text-subtle text-sm">
              Define test inputs and expected facts to validate your semantic models.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setRunDialogOpen(true)}>
              <Play className="h-4 w-4" />
              Run Batch
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Case
            </Button>
          </div>
        </div>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex-1 overflow-y-auto p-8 space-y-4">
        <div className="flex items-center gap-1.5">
          <Select value={filterAgent} onValueChange={setFilterAgentAndReset}>
            <SelectTrigger className="filter-trigger">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterModel} onValueChange={setFilterModelAndReset}>
            <SelectTrigger className="filter-trigger">
              <SelectValue placeholder="All models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All models</SelectItem>
              {models.map((m) => (
                <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {allTags.length > 0 && (
            <Select value={filterTag} onValueChange={setFilterTagAndReset}>
              <SelectTrigger className="filter-trigger">
                <SelectValue placeholder="All tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER}>All tags</SelectItem>
                {allTags.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasFilters && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={resetFilters}
              title="Clear filters"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {totalCases === 0 && !hasFilters ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No test cases yet. Create one to define expected behavior.
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Input</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Facts</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((tc) => (
                    <TableRow key={tc._id}>
                      <TableCell className="font-medium">{tc.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{tc.testAgent?.name ?? "—"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{tc.semanticModel}</Badge>
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground text-sm">
                        {tc.inputMessage}
                      </TableCell>
                      <TableCell>
                        {tc.tags?.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {tc.tags.map((t) => (
                              <Badge key={t} variant="outline" className="text-xs">
                                <Tag className="h-3 w-3 mr-0.5" />{t}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{tc.expectedFacts.length}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditCase(tc)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(tc)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {cases.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                        No test cases match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>

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
          </>
        )}
      </div>

      <CaseFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={project._id}
        agents={agents}
        onSuccess={() => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["test-cases", project._id] });
        }}
        onRunNavigate={handleRunNavigate}
      />

      {editCase && (
        <CaseFormDialog
          open={true}
          onOpenChange={() => setEditCase(null)}
          projectId={project._id}
          agents={agents}
          testCase={editCase}
          onSuccess={() => {
            setEditCase(null);
            queryClient.invalidateQueries({ queryKey: ["test-cases", project._id] });
          }}
          onRunNavigate={handleRunNavigate}
        />
      )}

      <RunBatchDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        projectId={project._id}
        agents={agents}
        models={models}
        onSuccess={handleBatchSuccess}
      />

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Test Case</DialogTitle>
            <DialogDescription>
              Delete <strong>{deleteTarget?.title}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

