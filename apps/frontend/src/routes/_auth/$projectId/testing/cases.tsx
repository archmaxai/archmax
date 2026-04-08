import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  ClipboardList,
  X,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Textarea,
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
} from "@semlayer/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

export const Route = createFileRoute("/_auth/$projectId/testing/cases")({
  component: TestCasesPage,
});

interface TestCaseItem {
  _id: string;
  title: string;
  semanticModel: string;
  inputMessage: string;
  expectedFacts: string[];
  createdAt: string;
}

interface TestAgentItem {
  _id: string;
  name: string;
}

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

interface SemanticModelSummary {
  name: string;
}

function TestCasesPage() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editCase, setEditCase] = useState<TestCaseItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TestCaseItem | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data: cases = [] } = useQuery<TestCaseItem[]>({
    queryKey: ["test-cases", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-cases"].$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to load test cases");
      return res.json() as Promise<TestCaseItem[]>;
    },
  });

  const { data: runs = [] } = useQuery<TestRunSummary[]>({
    queryKey: ["test-runs", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-runs"].$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to load test runs");
      return res.json() as Promise<TestRunSummary[]>;
    },
    refetchInterval: 5000,
  });

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
        <div className="content-tight">
          <h1 className="text-heading text-2xl">Test Cases</h1>
          <p className="text-subtle text-sm">
            Define test inputs and expected facts to validate your semantic models.
          </p>
        </div>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-heading text-lg">Cases</h2>
          <div className="flex gap-2">
            {cases.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setRunDialogOpen(true)}>
                <Play className="h-4 w-4" />
                Run Batch
              </Button>
            )}
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Case
            </Button>
          </div>
        </div>

        {cases.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No test cases yet. Create one to define expected behavior.
            </p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead>Facts</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((tc) => (
                  <TableRow key={tc._id}>
                    <TableCell className="font-medium">{tc.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{tc.semanticModel}</Badge>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground text-sm">
                      {tc.inputMessage}
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
              </TableBody>
            </Table>
          </Card>
        )}

        {runs.length > 0 && (
          <>
            <h2 className="text-heading text-lg">Run History</h2>
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
                    <TableRow
                      key={r._id}
                      className="cursor-pointer"
                      onClick={() => setSelectedRunId(r._id)}
                    >
                      <TableCell>{statusIcon(r.status)}</TableCell>
                      <TableCell className="font-medium">{r.testAgent?.name ?? "—"}</TableCell>
                      <TableCell>{r.caseCount}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {r.passed > 0 && <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">{r.passed} passed</Badge>}
                          {r.failed > 0 && <Badge variant="destructive" className="text-xs">{r.failed} failed</Badge>}
                          {r.errors > 0 && <Badge variant="outline" className="text-xs">{r.errors} errors</Badge>}
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
          </>
        )}
      </div>

      <CaseFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={project._id}
        onSuccess={() => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["test-cases", project._id] });
        }}
      />

      {editCase && (
        <CaseFormDialog
          open={true}
          onOpenChange={() => setEditCase(null)}
          projectId={project._id}
          testCase={editCase}
          onSuccess={() => {
            setEditCase(null);
            queryClient.invalidateQueries({ queryKey: ["test-cases", project._id] });
          }}
        />
      )}

      <RunBatchDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        projectId={project._id}
        testCaseIds={cases.map((c) => c._id)}
        onSuccess={() => {
          setRunDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["test-runs", project._id] });
        }}
      />

      {selectedRunId && (
        <TestRunDetailDialog
          runId={selectedRunId}
          projectId={project._id}
          onClose={() => setSelectedRunId(null)}
        />
      )}

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

function CaseFormDialog({
  open,
  onOpenChange,
  projectId,
  testCase,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  testCase?: TestCaseItem;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(testCase?.title ?? "");
  const [semanticModel, setSemanticModel] = useState(testCase?.semanticModel ?? "");
  const [inputMessage, setInputMessage] = useState(testCase?.inputMessage ?? "");
  const [facts, setFacts] = useState<string[]>(testCase?.expectedFacts ?? [""]);

  const { data: models = [] } = useQuery<SemanticModelSummary[]>({
    queryKey: ["semantic-models", projectId],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["semantic-models"].$get({
        param: { projectId },
      });
      if (!res.ok) throw new Error("Failed to load models");
      return res.json() as Promise<SemanticModelSummary[]>;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const expectedFacts = facts.filter((f) => f.trim().length > 0);
      if (testCase) {
        const res = await api.api.projects[":projectId"]["test-cases"][":caseId"].$put({
          param: { projectId, caseId: testCase._id },
          json: { title, semanticModel, inputMessage, expectedFacts },
        });
        if (!res.ok) throw new Error("Failed to update test case");
      } else {
        const res = await api.api.projects[":projectId"]["test-cases"].$post({
          param: { projectId },
          json: { title, semanticModel, inputMessage, expectedFacts },
        });
        if (!res.ok) throw new Error("Failed to create test case");
      }
    },
    onSuccess: () => {
      toast.success(testCase ? "Test case updated" : "Test case created");
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const validFacts = facts.filter((f) => f.trim().length > 0);
  const canSubmit =
    title.trim().length > 0 &&
    semanticModel.length > 0 &&
    inputMessage.trim().length > 0 &&
    validFacts.length > 0 &&
    !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{testCase ? "Edit Test Case" : "Create Test Case"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input placeholder="e.g. Revenue for 2025" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Semantic Model</Label>
            <Select value={semanticModel} onValueChange={setSemanticModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Input Message</Label>
            <Textarea
              rows={3}
              placeholder="e.g. What's the revenue for 2025?"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Expected Facts</Label>
            <div className="space-y-2">
              {facts.map((fact, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="e.g. Revenue is 1.65 MEUR"
                    value={fact}
                    onChange={(e) => {
                      const next = [...facts];
                      next[i] = e.target.value;
                      setFacts(next);
                    }}
                  />
                  {facts.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => setFacts(facts.filter((_, j) => j !== i))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFacts([...facts, ""])}
              >
                <Plus className="h-4 w-4" />
                Add Fact
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving..." : testCase ? "Save Changes" : "Create Case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunBatchDialog({
  open,
  onOpenChange,
  projectId,
  testCaseIds,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  testCaseIds: string[];
  onSuccess: () => void;
}) {
  const [selectedAgent, setSelectedAgent] = useState("");

  const { data: agents = [] } = useQuery<TestAgentItem[]>({
    queryKey: ["test-agents", projectId],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-agents"].$get({
        param: { projectId },
      });
      if (!res.ok) throw new Error("Failed to load agents");
      return res.json() as Promise<TestAgentItem[]>;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.api.projects[":projectId"]["test-runs"].$post({
        param: { projectId },
        json: { testAgentId: selectedAgent, testCaseIds },
      });
      if (!res.ok) throw new Error("Failed to start batch run");
    },
    onSuccess: () => {
      toast.success("Batch run started");
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Batch Test</DialogTitle>
          <DialogDescription>
            Run {testCaseIds.length} test case{testCaseIds.length !== 1 ? "s" : ""} with a selected test agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Test Agent</Label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Select an agent..." />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!selectedAgent || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Starting..." : "Run Batch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestRunDetailDialog({
  runId,
  projectId,
  onClose,
}: {
  runId: string;
  projectId: string;
  onClose: () => void;
}) {
  const { data: run } = useQuery({
    queryKey: ["test-run", runId],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-runs"][":runId"].$get({
        param: { projectId, runId },
      });
      if (!res.ok) throw new Error("Failed to load test run");
      return res.json() as Promise<{
        _id: string;
        status: string;
        cases: Array<{
          title: string;
          semanticModel: string;
          inputMessage: string;
          status: string;
          agentResponse: string;
          factResults: Array<{ fact: string; passed: boolean; reasoning: string }>;
          durationMs: number;
          errorMessage?: string;
        }>;
      }>;
    },
    refetchInterval: (query) =>
      query.state.data?.status === "running" || query.state.data?.status === "pending" ? 3000 : false,
  });

  function caseStatusIcon(status: string) {
    switch (status) {
      case "passed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      case "error": return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "running": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test Run Results</DialogTitle>
          <DialogDescription>
            {run ? `${run.cases.length} test case${run.cases.length !== 1 ? "s" : ""} — ${run.status}` : "Loading..."}
          </DialogDescription>
        </DialogHeader>

        {run && (
          <div className="space-y-4">
            {run.cases.map((tc, i) => (
              <Card key={i} className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {caseStatusIcon(tc.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{tc.title}</span>
                      <Badge variant="secondary" className="text-xs">{tc.semanticModel}</Badge>
                      {tc.durationMs > 0 && (
                        <span className="text-xs text-muted-foreground">{(tc.durationMs / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{tc.inputMessage}</p>
                  </div>
                </div>

                {tc.errorMessage && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {tc.errorMessage}
                  </div>
                )}

                {tc.agentResponse && (
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Agent Response</p>
                    <p className="text-sm whitespace-pre-wrap">{tc.agentResponse.slice(0, 500)}{tc.agentResponse.length > 500 ? "..." : ""}</p>
                  </div>
                )}

                {tc.factResults.length > 0 && (
                  <div className="space-y-1.5">
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
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
