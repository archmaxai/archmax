import { useState } from "react";
import { Upload, Loader2 } from "lucide-react";
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
import { usePublishStatus, usePublish } from "@/lib/use-publish";

export function PublishButton() {
  const { project } = useProject();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");

  const statusQuery = usePublishStatus();
  const publishMutation = usePublish();

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
              {project.github?.connected &&
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
              onClick={() =>
                publishMutation.mutate(message, {
                  onSuccess: () => {
                    setDialogOpen(false);
                    setMessage("");
                  },
                })
              }
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
