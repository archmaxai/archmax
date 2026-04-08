import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Label,
  Textarea,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@archsem/ui";
import { api } from "@/lib/api";
import type { TestCaseItem, TestAgentItem, SemanticModelSummary } from "./types";

interface CaseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  agents: TestAgentItem[];
  testCase?: TestCaseItem;
  onSuccess: () => void;
}

export function CaseFormDialog({
  open,
  onOpenChange,
  projectId,
  agents,
  testCase,
  onSuccess,
}: CaseFormDialogProps) {
  const [title, setTitle] = useState(testCase?.title ?? "");
  const [testAgentId, setTestAgentId] = useState(testCase?.testAgent?._id ?? "");
  const [semanticModel, setSemanticModel] = useState(testCase?.semanticModel ?? "");
  const [inputMessage, setInputMessage] = useState(testCase?.inputMessage ?? "");
  const [facts, setFacts] = useState<string[]>(testCase?.expectedFacts ?? [""]);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(testCase?.tags ?? []);
  const [maxToolCalls, setMaxToolCalls] = useState<string>(
    testCase?.maxToolCalls != null ? String(testCase.maxToolCalls) : "",
  );

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

  function addTag() {
    const v = tagInput.trim().toLowerCase();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput("");
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const expectedFacts = facts.filter((f) => f.trim().length > 0);
      const parsed = maxToolCalls ? parseInt(maxToolCalls, 10) : undefined;
      const payload: any = { title, testAgentId, semanticModel, inputMessage, expectedFacts, tags };
      if (parsed && parsed > 0) payload.maxToolCalls = parsed;
      if (testCase) {
        const res = await api.api.projects[":projectId"]["test-cases"][":caseId"].$put({
          param: { projectId, caseId: testCase._id },
          json: payload,
        });
        if (!res.ok) throw new Error("Failed to update test case");
      } else {
        const res = await api.api.projects[":projectId"]["test-cases"].$post({
          param: { projectId },
          json: payload,
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
    testAgentId.length > 0 &&
    semanticModel.length > 0 &&
    inputMessage.trim().length > 0 &&
    validFacts.length > 0 &&
    !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{testCase ? "Edit Test Case" : "Create Test Case"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input placeholder="e.g. Revenue for 2025" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Test Agent</Label>
              <Select value={testAgentId} onValueChange={setTestAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent..." />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Semantic Model</Label>
              <Select value={semanticModel} onValueChange={setSemanticModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model..." />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              />
              <Button variant="outline" size="sm" className="shrink-0" onClick={addTag} disabled={!tagInput.trim()}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap pt-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs gap-1">
                    {t}
                    <button onClick={() => setTags(tags.filter((x) => x !== t))} className="ml-0.5 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Max Tool Calls <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              type="number"
              min={1}
              placeholder="No limit"
              value={maxToolCalls}
              onChange={(e) => setMaxToolCalls(e.target.value)}
            />
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
