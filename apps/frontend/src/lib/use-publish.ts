import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

interface PublishStatus {
  hasUnpublishedChanges: boolean;
  lastPublishedAt: string | null;
  lastMessage: string | null;
}

export function usePublishStatus() {
  const { project } = useProject();
  return useQuery({
    queryKey: ["publish-status", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"].publish.status.$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to fetch publish status");
      return res.json() as Promise<PublishStatus>;
    },
    refetchInterval: 15_000,
  });
}

export function usePublish() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      const res = await api.api.projects[":projectId"].publish.$post({
        param: { projectId: project._id },
        json: { message },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as { error?: string } | null)?.error ?? "Publish failed");
      }
      return res.json() as Promise<Record<string, unknown> & { pushWarning?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["publish-status", project._id] });
      toast.success("Changes published");
      if (data.pushWarning) {
        toast.warning(`Published locally, but push to remote failed: ${data.pushWarning}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });
}
