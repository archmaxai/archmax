import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@archmax/ui";
import { useProject } from "@/lib/project-context";

interface PublishStatus {
  hasUnpublishedChanges: boolean;
  lastPublishedAt: string | null;
  lastMessage: string | null;
}

export function PublishButton() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");

  const statusQuery = useQuery({
    queryKey: ["publish-status", project._id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project._id}/publish/status`);
      if (!res.ok) throw new Error("Failed to fetch publish status");
      return res.json() as Promise<PublishStatus>;
    },
    refetchInterval: 15_000,
  });

  const publishMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await fetch(`/api/projects/${project._id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as { error?: string } | null)?.error ?? "Publish failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setDialogOpen(false);
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["publish-status", project._id] });
      toast.success("Changes published");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const hasChanges = statusQuery.data?.hasUnpublishedChanges ?? false;

  if (!hasChanges) return null;

  return (
    <>
      <button
        disabled={publishMutation.isPending}
        onClick={() => setDialogOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-foreground text-background hover:bg-foreground/80 transition-colors disabled:opacity-50"
      >
        <Upload className="h-3 w-3" />
        Publish
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish Semantic Models</DialogTitle>
            <DialogDescription>
              Publish current models to make them available via MCP.
              {project.github?.connected && project.github.repo &&
                " Changes will also be pushed to GitHub."
              }
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder="Describe what changed..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            autoFocus
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => publishMutation.mutate(message)}
              disabled={!message.trim() || publishMutation.isPending}
            >
              {publishMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
