import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@archmax/ui";
import { api } from "@/lib/api";
import {
  ALL_FILTER,
  type TestAgentItem,
  type SemanticModelSummary,
  type TestCasesResponse,
} from "./types";

interface RunBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  agents: TestAgentItem[];
  models: SemanticModelSummary[];
  onSuccess: (runId: string) => void;
}

export function RunBatchDialog({
  open,
  onOpenChange,
  projectId,
  agents,
  models,
  onSuccess,
}: RunBatchDialogProps) {
  const [batchAgent, setBatchAgent] = useState(ALL_FILTER);
  const [batchModel, setBatchModel] = useState(ALL_FILTER);
  const [batchTag, setBatchTag] = useState(ALL_FILTER);

  const batchQuery: Record<string, string> = { page: "1", limit: "500" };
  if (batchAgent !== ALL_FILTER) batchQuery.agentId = batchAgent;
  if (batchModel !== ALL_FILTER) batchQuery.semanticModel = batchModel;
  if (batchTag !== ALL_FILTER) batchQuery.tags = batchTag;

  const { data: batchCasesData } = useQuery<TestCasesResponse>({
    queryKey: ["test-cases-batch", projectId, batchAgent, batchModel, batchTag],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-cases"].$get({
        param: { projectId },
        query: batchQuery,
      } as any);
      if (!res.ok) throw new Error("Failed to load test cases");
      return res.json() as unknown as TestCasesResponse;
    },
    enabled: open,
  });

  const matchingIds = useMemo(
    () => (batchCasesData?.items ?? []).map((c) => c._id),
    [batchCasesData],
  );
  const matchingCount = batchCasesData?.total ?? 0;

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const tc of batchCasesData?.items ?? []) {
      for (const t of tc.tags ?? []) set.add(t);
    }
    return Array.from(set).sort();
  }, [batchCasesData]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.api.projects[":projectId"]["test-runs"].$post({
        param: { projectId },
        json: { testCaseIds: matchingIds },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as any)?.error ?? "Failed to start batch run");
      }
      return res.json() as Promise<{ _id: string }>;
    },
    onSuccess: (data) => {
      toast.success("Batch run started");
      onSuccess(data._id);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Batch Test</DialogTitle>
          <DialogDescription>
            Filter test cases to include in this batch, then run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3">
              <Label className="text-sm text-right">Agent</Label>
              <Select value={batchAgent} onValueChange={setBatchAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="All agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>All agents</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Label className="text-sm text-right">Model</Label>
              <Select value={batchModel} onValueChange={setBatchModel}>
                <SelectTrigger>
                  <SelectValue placeholder="All models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>All models</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Label className="text-sm text-right">Tag</Label>
              <Select value={batchTag} onValueChange={setBatchTag}>
                <SelectTrigger>
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>All tags</SelectItem>
                  {allTags.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {matchingCount} test case{matchingCount !== 1 ? "s" : ""} match the filters.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={mutation.isPending || matchingCount === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Starting..." : `Run ${matchingCount} Case${matchingCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
