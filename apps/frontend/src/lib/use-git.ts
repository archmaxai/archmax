import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

export function useGitStatus() {
  const { project } = useProject();
  return useQuery({
    queryKey: ["git-status", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"].git.status.$get({
        param: { projectId: project._id },
      });
      if (!res.ok) return { initialized: false };
      return res.json();
    },
  });
}

export function useGitInit() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.api.projects[":projectId"].git.init.$post({
        param: { projectId: project._id },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as { error?: string } | null)?.error ?? "Failed to initialize Git");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-status", project._id] });
      toast.success("Git repository initialized");
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useGitReinit() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.api.projects[":projectId"].git.reinit.$post({
        param: { projectId: project._id },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as { error?: string } | null)?.error ?? "Failed to re-initialize");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-status", project._id] });
      queryClient.invalidateQueries({ queryKey: ["git-log", project._id] });
      queryClient.invalidateQueries({ queryKey: ["publish-status", project._id] });
      toast.success("Git repository re-initialized");
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useGitSync() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.api.projects[":projectId"].git.sync.$post({
        param: { projectId: project._id },
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Sync failed");
      return data as { conflicts: boolean; files?: string[]; message: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["semantic-models"] });
      queryClient.invalidateQueries({ queryKey: ["git-log", project._id] });
      if (data.conflicts) {
        toast.error(`Merge conflicts in: ${data.files?.join(", ")}`);
      } else {
        toast.success(data.message);
      }
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useGitLog(limit = 10) {
  const { project } = useProject();
  return useQuery({
    queryKey: ["git-log", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"].git.log.$get({
        param: { projectId: project._id },
        query: { limit: String(limit) },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });
}
