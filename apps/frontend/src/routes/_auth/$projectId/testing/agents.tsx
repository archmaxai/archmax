import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Bot, Loader2, Zap } from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@archmax/ui";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

export const Route = createFileRoute("/_auth/$projectId/testing/agents")({
  component: TestAgentsPage,
});

interface TestAgentItem {
  _id: string;
  name: string;
  semanticModels: string[];
  systemPrompt: string;
  llmBaseUrl: string;
  llmModel: string;
  apiKeySet: boolean;
  apiKeyMasked: string;
  createdAt: string;
}

interface SemanticModelSummary {
  name: string;
}

function TestAgentsPage() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const [editAgent, setEditAgent] = useState<TestAgentItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TestAgentItem | null>(null);

  const { data: agents = [] } = useQuery<TestAgentItem[]>({
    queryKey: ["test-agents", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-agents"].$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to load test agents");
      return res.json() as Promise<TestAgentItem[]>;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await api.api.projects[":projectId"]["test-agents"][":agentId"].$delete({
        param: { projectId: project._id, agentId },
      });
      if (!res.ok) throw new Error("Failed to delete agent");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-agents", project._id] });
      toast.success("Test agent deleted");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="content-tight">
            <h1 className="text-heading text-2xl">Test Agents</h1>
            <p className="text-subtle text-sm">
              Configure LLM-powered agents to test your semantic models.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Agent
          </Button>
        </div>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex-1 overflow-y-auto p-8 space-y-6">

        {agents.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <Bot className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No test agents yet. Create one to start testing your semantic models.
            </p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Models</TableHead>
                  <TableHead>LLM Model</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {a.semanticModels.map((m) => (
                          <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{a.llmModel}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-48 truncate">{a.llmBaseUrl}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditAgent(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(a)}
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
      </div>

      <AgentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={project._id}
        onSuccess={() => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["test-agents", project._id] });
        }}
      />

      {editAgent && (
        <AgentFormDialog
          open={true}
          onOpenChange={() => setEditAgent(null)}
          projectId={project._id}
          agent={editAgent}
          onSuccess={() => {
            setEditAgent(null);
            queryClient.invalidateQueries({ queryKey: ["test-agents", project._id] });
          }}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Test Agent</DialogTitle>
            <DialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
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

function AgentFormDialog({
  open,
  onOpenChange,
  projectId,
  agent: initialAgent,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  agent?: TestAgentItem;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [agent, setAgent] = useState(initialAgent);
  const [name, setName] = useState(initialAgent?.name ?? "");
  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    new Set(initialAgent?.semanticModels ?? []),
  );
  const [systemPrompt, setSystemPrompt] = useState(
    initialAgent?.systemPrompt ?? "You are a data analyst. Use the available tools to explore semantic models and answer questions by querying the database.",
  );
  const [llmBaseUrl, setLlmBaseUrl] = useState(initialAgent?.llmBaseUrl ?? "https://openrouter.ai/api/v1");
  const [apiKey, setApiKey] = useState("");
  const [llmModel, setLlmModel] = useState(initialAgent?.llmModel ?? "");

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

  async function saveAgent(): Promise<TestAgentItem> {
    if (agent) {
      const body: Record<string, unknown> = {
        name,
        semanticModels: Array.from(selectedModels),
        systemPrompt,
        llmBaseUrl,
        llmModel,
      };
      if (apiKey) body.apiKey = apiKey;
      const res = await api.api.projects[":projectId"]["test-agents"][":agentId"].$put({
        param: { projectId, agentId: agent._id },
        json: body as any,
      });
      if (!res.ok) throw new Error("Failed to update agent");
      return res.json() as unknown as TestAgentItem;
    }
    const res = await api.api.projects[":projectId"]["test-agents"].$post({
      param: { projectId },
      json: {
        name,
        semanticModels: Array.from(selectedModels),
        systemPrompt,
        llmBaseUrl,
        apiKey,
        llmModel,
      },
    });
    if (!res.ok) throw new Error("Failed to create agent");
    return res.json() as unknown as TestAgentItem;
  }

  const mutation = useMutation({
    mutationFn: saveAgent,
    onSuccess: () => {
      toast.success(agent ? "Agent updated" : "Agent created");
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  function toggleModel(modelName: string) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelName)) next.delete(modelName);
      else next.add(modelName);
      return next;
    });
  }

  async function testAgentConnection(agentId: string) {
    const res = await api.api.projects[":projectId"]["test-agents"][":agentId"]["test-connection"].$post({
      param: { projectId, agentId },
      json: {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error((body as any)?.error ?? "Connection test failed");
    }
    return res.json();
  }

  const testMutation = useMutation({
    mutationFn: async () => {
      let current = agent;
      if (!current) {
        current = await saveAgent();
        setAgent(current);
        queryClient.invalidateQueries({ queryKey: ["test-agents", projectId] });
        toast.success("Agent created");
      }
      return testAgentConnection(current._id);
    },
    onSuccess: () => toast.success("LLM connection is healthy"),
    onError: (err) => toast.error(err.message),
  });

  const canSubmit =
    name.trim().length > 0 &&
    llmBaseUrl.trim().length > 0 &&
    llmModel.trim().length > 0 &&
    (agent || apiKey.trim().length > 0) &&
    !mutation.isPending;

  const canTest =
    name.trim().length > 0 &&
    llmBaseUrl.trim().length > 0 &&
    llmModel.trim().length > 0 &&
    (agent || apiKey.trim().length > 0) &&
    !testMutation.isPending &&
    !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{agent ? "Edit Test Agent" : "Create Test Agent"}</DialogTitle>
          <DialogDescription>
            Configure an LLM endpoint to test your semantic models.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input placeholder="e.g. GPT-4o Tester" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Semantic Models</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  {selectedModels.size === 0 ? (
                    <span className="text-muted-foreground">Select models...</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {Array.from(selectedModels).map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                {models.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">No semantic models in this project.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {models.map((m) => (
                      <button
                        key={m.name}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-foreground/[0.05] transition-colors"
                        onClick={() => toggleModel(m.name)}
                      >
                        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          selectedModels.has(m.name) ? "bg-primary border-primary" : "border-input"
                        }`}>
                          {selectedModels.has(m.name) && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <span className="flex-1 text-left truncate">{m.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>System Prompt</Label>
            <Textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>OpenAI Base URL</Label>
              <Input value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input placeholder="e.g. gpt-4o" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>API Key {agent && <span className="text-muted-foreground font-normal">(leave blank to keep current)</span>}</Label>
            <Input
              type="password"
              placeholder={agent ? "••••••••" : "sk-..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="mr-auto"
            disabled={!canTest}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            Test Connection
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving..." : agent ? "Save Changes" : "Create Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
