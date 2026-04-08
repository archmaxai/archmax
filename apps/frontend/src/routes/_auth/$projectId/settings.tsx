import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListOrdered, FolderPen, Github, Loader2, Trash2 } from "lucide-react";
import {
  Label, Card, Input, Button,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@archsem/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

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

  useEffect(() => {
    setTitleInput(project.title);
    setSlugInput(project.slug);
    setPageSizeInput(String(project.mcpPageSize ?? 50));
    setSlugTouched(false);
    setSlugError(null);
  }, [project._id, project.title, project.slug, project.mcpPageSize]);

  const saveMutation = useMutation({
    mutationFn: async (body: { title?: string; slug?: string; mcpPageSize?: number }) => {
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
  const isDirty = titleDirty || slugDirty || pageSizeDirty;
  const hasValidationErrors = !!slugError || (pageSizeInput !== "" && !pageSizeValid);

  function handleSave() {
    const updates: { title?: string; slug?: string; mcpPageSize?: number } = {};
    if (titleDirty) updates.title = trimmedTitle;
    if (slugDirty) updates.slug = slugInput;
    if (pageSizeDirty) updates.mcpPageSize = parsedPageSize;
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
        <div className="flex max-w-xl flex-col gap-4">
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

          <GitHubCard />
          <DeleteProjectCard />
        </div>
      </div>
    </div>
  );
}

function GitHubCard() {
  const { project } = useProject();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const res = await fetch("/api/config");
      return res.json() as Promise<{ githubEnabled: boolean }>;
    },
    staleTime: Infinity,
  });

  const reposQuery = useQuery({
    queryKey: ["github-repos", project._id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project._id}/github/repos`);
      if (!res.ok) throw new Error("Failed to fetch repos");
      return res.json() as Promise<Array<{ full_name: string; name: string; owner: string }>>;
    },
    enabled: !!project.github?.connected,
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${project._id}/github`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project._id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("GitHub disconnected");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateGitHubMutation = useMutation({
    mutationFn: async (body: { githubRepo?: string; githubBranch?: string }) => {
      const res = await api.api.projects[":id"].$put({
        param: { id: project._id },
        json: body,
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project._id] });
      toast.success("GitHub settings updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const [branchInput, setBranchInput] = useState(project.github?.branch ?? "main");

  useEffect(() => {
    setBranchInput(project.github?.branch ?? "main");
  }, [project.github?.branch]);

  if (!configQuery.data?.githubEnabled) return null;

  const gh = project.github;

  return (
    <Card className="p-6">
      <div className="flex gap-3">
        <Github className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-1 flex-col gap-4">
          <div className="content-tight">
            <Label className="text-base font-medium">GitHub Integration</Label>
            <p className="text-muted-foreground text-sm">
              Push published semantic models to a GitHub repository.
            </p>
          </div>

          {!gh?.connected ? (
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = `/api/projects/${project._id}/github/authorize`;
              }}
            >
              Connect to GitHub
            </Button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                Connected as <span className="font-medium">{gh.owner}</span>
              </p>

              <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3">
                <Label htmlFor="github-repo" className="text-sm">Repository</Label>
                <Select
                  value={gh.repo || undefined}
                  onValueChange={(val) => updateGitHubMutation.mutate({ githubRepo: val })}
                >
                  <SelectTrigger id="github-repo">
                    <SelectValue placeholder="Select a repository..." />
                  </SelectTrigger>
                  <SelectContent>
                    {reposQuery.data?.map((repo) => (
                      <SelectItem key={repo.full_name} value={repo.full_name}>
                        {repo.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor="github-branch" className="text-sm">Branch</Label>
                <Input
                  id="github-branch"
                  value={branchInput}
                  onChange={(e) => setBranchInput(e.target.value)}
                  onBlur={() => {
                    const trimmed = branchInput.trim() || "main";
                    if (trimmed !== gh.branch) {
                      updateGitHubMutation.mutate({ githubBranch: trimmed });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              </div>

              <div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  Disconnect
                </Button>
              </div>
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
