import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Switch,
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
} from "@archsem/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

export const Route = createFileRoute("/_auth/$projectId/mcp-access")({
  component: McpAccessPage,
});

interface McpTokenListItem {
  _id: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface SemanticModelSummary {
  name: string;
  description?: string;
}

function McpAccessPage() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<McpTokenListItem | null>(null);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const { data: tokens = [] } = useQuery<McpTokenListItem[]>({
    queryKey: ["mcp-tokens", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["mcp-tokens"].$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to load tokens");
      return res.json() as Promise<McpTokenListItem[]>;
    },
    refetchInterval: 30_000,
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

  const revokeMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const res = await api.api.projects[":projectId"]["mcp-tokens"][":tokenId"].$delete({
        param: { projectId: project._id, tokenId },
      });
      if (!res.ok) throw new Error("Failed to revoke token");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-tokens", project._id] });
      toast.success("Token revoked");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const slugOrId = project.slug || project._id;
  const mcpEndpoint = `${window.location.origin}/mcp/${slugOrId}/mcp`;
  const mcpTestEndpoint = `${window.location.origin}/mcp/${slugOrId}/test/mcp`;
  const [copiedTestEndpoint, setCopiedTestEndpoint] = useState(false);

  async function copyEndpoint() {
    await navigator.clipboard.writeText(mcpEndpoint);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  }

  async function copyTestEndpoint() {
    await navigator.clipboard.writeText(mcpTestEndpoint);
    setCopiedTestEndpoint(true);
    setTimeout(() => setCopiedTestEndpoint(false), 2000);
  }

  async function copyToken() {
    if (!revealToken) return;
    await navigator.clipboard.writeText(revealToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function isExpired(expiresAt: string | null) {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="content-tight">
            <h1 className="text-heading text-2xl">MCP Access</h1>
            <p className="text-subtle text-sm">
              Manage bearer tokens for AI agents connecting to this project's MCP server.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Token
          </Button>
        </div>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5 flex flex-col justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Published Endpoint
              </Label>
              <code className="mt-1 block text-sm font-mono truncate">
                {mcpEndpoint}
              </code>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={copyEndpoint}
            >
              {copiedEndpoint ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiedEndpoint ? "Copied" : "Copy"}
            </Button>
          </Card>
          <Card className="p-5 flex flex-col justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Live-Testing Endpoint
                </Label>
                <Badge variant="outline" className="text-xs">Test</Badge>
              </div>
              <code className="mt-1 block text-sm font-mono truncate">
                {mcpTestEndpoint}
              </code>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={copyTestEndpoint}
            >
              {copiedTestEndpoint ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiedTestEndpoint ? "Copied" : "Copy"}
            </Button>
          </Card>
        </div>

        {tokens.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <Key className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No tokens yet. Create one to connect an AI agent to this project.
            </p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Semantic Models</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {t.scopes.map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isExpired(t.expiresAt) ? (
                        <Badge variant="destructive" className="text-xs">Expired</Badge>
                      ) : t.expiresAt ? (
                        formatDate(t.expiresAt)
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(t.lastUsedAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={project._id}
        models={models}
        onCreated={(raw) => {
          setCreateOpen(false);
          setRevealToken(raw);
          queryClient.invalidateQueries({ queryKey: ["mcp-tokens", project._id] });
        }}
      />

      <Dialog open={!!revealToken} onOpenChange={() => setRevealToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token Created</DialogTitle>
            <DialogDescription>
              Copy this token now — it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
            <code className="flex-1 text-sm font-mono break-all select-all">
              {revealToken}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={copyToken}
            >
              {copiedToken ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <span className="text-muted-foreground">
              Store this token securely. If you lose it, you'll need to create a new one.
            </span>
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Token</DialogTitle>
            <DialogDescription>
              This will permanently revoke <strong>{deleteTarget?.name}</strong>.
              Any agents using it will lose access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => deleteTarget && revokeMutation.mutate(deleteTarget._id)}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
  projectId,
  models,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  models: SemanticModelSummary[];
  onCreated: (rawToken: string) => void;
}) {
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.api.projects[":projectId"]["mcp-tokens"].$post({
        param: { projectId },
        json: {
          name,
          scopes: Array.from(selectedScopes),
          expiresAt: hasExpiry && expiryDate ? new Date(expiryDate).toISOString() : null,
        },
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || "Failed to create token");
      }
      return res.json() as Promise<{ token: string }>;
    },
    onSuccess: (data) => {
      onCreated(data.token);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setName("");
    setSelectedScopes(new Set());
    setHasExpiry(false);
    setExpiryDate("");
  }

  function toggleScope(modelName: string) {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(modelName)) next.delete(modelName);
      else next.add(modelName);
      return next;
    });
  }

  const canSubmit = name.trim().length > 0 && selectedScopes.size > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create MCP Token</DialogTitle>
          <DialogDescription>
            Generate a bearer token for an AI agent to access this project's semantic models.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token-name">Name</Label>
            <Input
              id="token-name"
              placeholder="e.g. Cursor Agent"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Semantic Model Access</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  {selectedScopes.size === 0 ? (
                    <span className="text-muted-foreground">Select models...</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {Array.from(selectedScopes).map((s) => (
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
                        onClick={() => toggleScope(m.name)}
                      >
                        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          selectedScopes.has(m.name) ? "bg-primary border-primary" : "border-input"
                        }`}>
                          {selectedScopes.has(m.name) && <Check className="h-3 w-3 text-primary-foreground" />}
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
            <div className="flex items-center justify-between">
              <Label>Expiration</Label>
              <Switch checked={hasExpiry} onCheckedChange={setHasExpiry} />
            </div>
            {hasExpiry && (
              <Input
                type="date"
                value={expiryDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Creating..." : "Create Token"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
