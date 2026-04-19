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

interface GitLogEntry {
  oid: string;
  message: string;
  author: { name: string; email: string };
  timestamp: string;
}

interface PaginatedLog {
  entries: GitLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export function useGitLog(opts: { limit?: number; page?: number } = {}) {
  const { project } = useProject();
  const limit = opts.limit ?? 10;
  const page = opts.page ?? 1;
  return useQuery({
    queryKey: ["git-log", project._id, limit, page],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"].git.log.$get({
        param: { projectId: project._id },
        query: { limit: String(limit), page: String(page) },
      });
      if (!res.ok) return { entries: [], total: 0, page, limit } as PaginatedLog;
      return res.json() as Promise<PaginatedLog>;
    },
  });
}

export function useGitRevertToCommit() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (oid: string) => {
      const res = await api.api.projects[":projectId"].git["revert-to-commit"].$post({
        param: { projectId: project._id },
        json: { oid },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as { error?: string } | null)?.error ?? "Revert failed");
      }
      return res.json() as Promise<{ oid: string; message: string; pushWarning?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["git-log", project._id] });
      queryClient.invalidateQueries({ queryKey: ["publish-status", project._id] });
      queryClient.invalidateQueries({ queryKey: ["semantic-models"] });
      if (data.message === "Already at this version") {
        toast.success(data.message);
      } else {
        toast.success("Reverted");
      }
      if (data.pushWarning) {
        toast.warning(`Reverted locally, but push to remote failed: ${data.pushWarning}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });
}
