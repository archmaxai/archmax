import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ListOrdered, FolderPen, Github, Loader2, Trash2, GitBranch, History,
} from "lucide-react";
import {
  Label, Card, Input, Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@archmax/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { useGitStatus, useGitInit, useGitReinit, useGitSync, useGitLog } from "@/lib/use-git";

export const Route = createFileRoute("/_auth/$projectId/settings")({
  component: SettingsPage,
});

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function slugify(text: string): string {
  let slug = text
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 2) slug = slug.padEnd(2, "0");
  return slug || "project";
}

function SettingsPage() {
  const { project } = useProject();
  const queryClient = useQueryClient();

  const [titleInput, setTitleInput] = useState(project.title);
  const [slugInput, setSlugInput] = useState(project.slug);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [pageSizeInput, setPageSizeInput] = useState(
    String(project.mcpPageSize ?? 50),
  );
  const [ghUrlInput, setGhUrlInput] = useState(project.github?.url ?? "");
  const [ghBranchInput, setGhBranchInput] = useState(project.github?.branch ?? "main");
  const [ghTokenInput, setGhTokenInput] = useState("");

  useEffect(() => {
    setTitleInput(project.title);
    setSlugInput(project.slug);
    setPageSizeInput(String(project.mcpPageSize ?? 50));
    setSlugTouched(false);
    setSlugError(null);
    setGhUrlInput(project.github?.url ?? "");
    setGhBranchInput(project.github?.branch ?? "main");
    setGhTokenInput("");
  }, [project._id, project.title, project.slug, project.mcpPageSize, project.github?.url, project.github?.branch]);

  const saveMutation = useMutation({
    mutationFn: async (body: { title?: string; slug?: string; mcpPageSize?: number; github?: { url: string; branch: string; token?: string } }) => {
      const res = await api.api.projects[":id"].$put({
        param: { id: project._id },
        json: body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          (data as { message?: string } | null)?.message ??
            "Failed to update project",
        );
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project._id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setGhTokenInput("");
      toast.success("Settings saved");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function handleTitleChange(value: string) {
    setTitleInput(value);
    if (!slugTouched) {
      const suggested = slugify(value);
      setSlugInput(suggested);
      setSlugError(null);
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlugInput(value);
    if (value.length >= 2 && SLUG_PATTERN.test(value)) {
      setSlugError(null);
    } else if (value.length > 0) {
      setSlugError(
        "Lowercase letters, numbers, and hyphens only (min 2 chars, must start and end with alphanumeric)",
      );
    } else {
      setSlugError(null);
    }
  }

  const trimmedTitle = titleInput.trim();
  const parsedPageSize = parseInt(pageSizeInput, 10);
  const pageSizeValid = !isNaN(parsedPageSize) && parsedPageSize >= 10 && parsedPageSize <= 200;
  const slugValid = slugInput.length >= 2 && SLUG_PATTERN.test(slugInput);

  const titleDirty = trimmedTitle !== project.title && trimmedTitle.length > 0;
  const slugDirty = slugInput !== project.slug && slugValid;
  const pageSizeDirty = pageSizeValid && parsedPageSize !== (project.mcpPageSize ?? 50);
  const ghUrlDirty = ghUrlInput.trim() !== (project.github?.url ?? "");
  const ghBranchDirty = ghBranchInput.trim() !== (project.github?.branch ?? "main");
  const ghTokenDirty = ghTokenInput.length > 0;
  const ghDirty = ghUrlDirty || ghBranchDirty || ghTokenDirty;
  const ghCanSave = ghDirty && ghUrlInput.trim().length > 0 && (ghTokenInput.length > 0 || !!project.github?.connected);
  const isDirty = titleDirty || slugDirty || pageSizeDirty || ghCanSave;
  const hasValidationErrors = !!slugError || (pageSizeInput !== "" && !pageSizeValid);

  function handleSave() {
    const updates: { title?: string; slug?: string; mcpPageSize?: number; github?: { url: string; branch: string; token?: string } } = {};
    if (titleDirty) updates.title = trimmedTitle;
    if (slugDirty) updates.slug = slugInput;
    if (pageSizeDirty) updates.mcpPageSize = parsedPageSize;
    if (ghCanSave) {
      const ghPayload: { url: string; branch: string; token?: string } = {
        url: ghUrlInput.trim(),
        branch: ghBranchInput.trim() || "main",
      };
      if (ghTokenInput) ghPayload.token = ghTokenInput;
      updates.github = ghPayload;
    }
    if (Object.keys(updates).length > 0) {
      saveMutation.mutate(updates);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <div className="content-tight flex items-start justify-between">
          <div>
            <h1 className="text-heading text-2xl">Settings</h1>
            <p className="text-subtle text-sm">
              Configure project-level settings for {project.title}
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={!isDirty || hasValidationErrors || saveMutation.isPending}
          >
            {saveMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save changes
          </Button>
        </div>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-6">
            <div className="flex gap-3">
              <FolderPen className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="flex flex-1 flex-col gap-4">
                <div className="content-tight">
                  <Label className="text-base font-medium">
                    Project Identity
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    The project name and URL-safe slug used in MCP endpoints.
                  </p>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3">
                  <Label htmlFor="project-title" className="text-sm">
                    Name
                  </Label>
                  <Input
                    id="project-title"
                    value={titleInput}
                    disabled={saveMutation.isPending}
                    onChange={(e) => handleTitleChange(e.target.value)}
                  />
                  <Label htmlFor="project-slug" className="text-sm">
                    Slug
                  </Label>
                  <div className="flex flex-col gap-1.5">
                    <Input
                      id="project-slug"
                      value={slugInput}
                      disabled={saveMutation.isPending}
                      onChange={(e) => handleSlugChange(e.target.value)}
                    />
                    {slugError && (
                      <p className="text-destructive text-xs">{slugError}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex gap-3">
              <ListOrdered className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="flex flex-1 flex-col gap-4">
                <div className="content-tight">
                  <Label className="text-base font-medium">
                    MCP Configuration
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Number of items returned per page in MCP tool responses
                    (semantic model overviews and dataset fields). Range: 10–200.
                  </p>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3">
                  <Label htmlFor="mcp-page-size" className="text-sm">
                    Items per page
                  </Label>
                  <Input
                    id="mcp-page-size"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    value={pageSizeInput}
                    disabled={saveMutation.isPending}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d+$/.test(v)) setPageSizeInput(v);
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>

          <GitSection
            ghUrlInput={ghUrlInput}
            setGhUrlInput={setGhUrlInput}
            ghBranchInput={ghBranchInput}
            setGhBranchInput={setGhBranchInput}
            ghTokenInput={ghTokenInput}
            setGhTokenInput={setGhTokenInput}
          />

          <DeleteProjectCard />
        </div>
      </div>
    </div>
  );
}

interface GitHubInputProps {
  ghUrlInput: string;
  setGhUrlInput: (v: string) => void;
  ghBranchInput: string;
  setGhBranchInput: (v: string) => void;
  ghTokenInput: string;
  setGhTokenInput: (v: string) => void;
}

function GitSection(props: GitHubInputProps) {
  const gitStatusQuery = useGitStatus();

  if (gitStatusQuery.isLoading) return null;

  if (!gitStatusQuery.data?.initialized) {
    return <GitMigrationCard />;
  }

  return (
    <>
      <GitHubCard {...props} />
      <PublishHistoryCard />
    </>
  );
}

function GitMigrationCard() {
  const initMutation = useGitInit();

  return (
    <Card className="p-6">
      <div className="flex gap-3">
        <GitBranch className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-1 flex-col gap-4">
          <div className="content-tight">
            <Label className="text-base font-medium">Version Control</Label>
            <p className="text-muted-foreground text-sm">
              This project has not been migrated to Git versioning yet. Initialize a
              local Git repository to enable version history, revert tools, and GitHub sync.
            </p>
          </div>
          <div>
            <Button
              onClick={() => initMutation.mutate()}
              disabled={initMutation.isPending}
            >
              {initMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Initialize Git
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function GitHubCard({ ghUrlInput, setGhUrlInput, ghBranchInput, setGhBranchInput, ghTokenInput, setGhTokenInput }: GitHubInputProps) {
  const { project } = useProject();
  const queryClient = useQueryClient();

  const isConnected = !!project.github?.connected;

  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.api.projects[":id"].$put({
        param: { id: project._id },
        json: { clearGithub: true },
      });
      if (!res.ok) throw new Error("Failed to remove");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project._id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("GitHub configuration removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const syncMutation = useGitSync();
  const reinitMutation = useGitReinit();

  return (
    <Card className="min-w-0 p-6">
      <div className="flex min-w-0 gap-3">
        <Github className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="content-tight">
            <Label className="text-base font-medium">GitHub</Label>
            <p className="text-muted-foreground text-sm">
              Push published semantic models to a GitHub repository using a Personal Access Token.
              The PAT needs the <code className="rounded bg-muted px-1 py-0.5 text-xs">repo</code> scope (classic) or <code className="rounded bg-muted px-1 py-0.5 text-xs">Contents: Read and write</code> permission (fine-grained).
            </p>
          </div>

          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3">
            <Label htmlFor="github-url" className="text-sm">Repository URL</Label>
            <Input
              id="github-url"
              placeholder="https://github.com/owner/repo.git"
              value={ghUrlInput}
              onChange={(e) => setGhUrlInput(e.target.value)}
            />
            <Label htmlFor="github-token" className="text-sm">Access Token</Label>
            <Input
              id="github-token"
              type="password"
              placeholder={isConnected ? "••••••••••" : "ghp_..."}
              value={ghTokenInput}
              onChange={(e) => setGhTokenInput(e.target.value)}
            />
            <Label htmlFor="github-branch" className="text-sm">Branch</Label>
            <Input
              id="github-branch"
              value={ghBranchInput}
              onChange={(e) => setGhBranchInput(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            {isConnected && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sync Now
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => reinitMutation.mutate()}
              disabled={reinitMutation.isPending}
            >
              {reinitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reinitialize Connection
            </Button>
            {isConnected && (
              <Button
                variant="destructive"
                size="sm"
                className="ml-auto"
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending}
              >
                Disconnect
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function PublishHistoryCard() {
  const logQuery = useGitLog(10);

  return (
    <Card className="p-6">
      <div className="flex gap-3">
        <History className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-1 flex-col gap-4">
          <div className="content-tight">
            <Label className="text-base font-medium">Publish History</Label>
            <p className="text-muted-foreground text-sm">
              Last 10 commits from the local Git repository.
            </p>
          </div>

          {logQuery.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : !logQuery.data?.length ? (
            <p className="text-sm text-muted-foreground">No publish history yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {logQuery.data.map((entry) => (
                <div key={entry.oid} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{entry.message.split("\n")[0]}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {timeAgo(entry.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function DeleteProjectCard() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.api.projects[":id"].$delete({
        param: { id: project._id },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          (data as { message?: string } | null)?.message ??
            "Failed to delete project",
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
      navigate({ to: "/" });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const canConfirm = confirmInput === project.title;

  return (
    <>
      <Card className="border-destructive/40 p-6">
        <div className="flex gap-3">
          <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="flex flex-1 flex-col gap-3">
            <div className="content-tight">
              <Label className="text-base font-medium">Danger Zone</Label>
              <p className="text-muted-foreground text-sm">
                Permanently delete this project and all its connections, tokens,
                and semantic models.
              </p>
            </div>
            <div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setConfirmInput("");
                  setOpen(true);
                }}
              >
                Delete project
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { if (!deleteMutation.isPending) setOpen(v); }}>
        <DialogContent showCloseButton={!deleteMutation.isPending}>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              This action cannot be undone. All connections, MCP tokens, and
              semantic models belonging to{" "}
              <span className="font-medium text-foreground">{project.title}</span>{" "}
              will be permanently removed.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-delete" className="text-sm">
              Type <span className="font-medium">{project.title}</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmInput}
              disabled={deleteMutation.isPending}
              onChange={(e) => setConfirmInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canConfirm && !deleteMutation.isPending) {
                  deleteMutation.mutate();
                }
              }}
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!canConfirm || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
