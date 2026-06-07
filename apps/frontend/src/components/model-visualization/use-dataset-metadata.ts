import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AiContext } from "./types";

export interface DatasetMetadataPatch {
  description?: string;
  ai_context?: AiContext;
  fields?: Array<{ name: string; description?: string; ai_context?: AiContext }>;
}

export function useUpdateDatasetMetadata(projectId: string, modelName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ datasetName, patch }: { datasetName: string; patch: DatasetMetadataPatch }) => {
      const res = await api.api.projects[":projectId"]["semantic-models"][":name"].datasets[
        ":datasetName"
      ].$patch({
        param: { projectId, name: modelName, datasetName },
        json: patch,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as { error?: string } | null)?.error ?? "Failed to save dataset");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["semantic-model", projectId, modelName] });
      toast.success("Dataset saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save dataset"),
  });
}
