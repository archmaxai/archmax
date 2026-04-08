import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/project-context";

export const Route = createFileRoute("/_auth/")({
  component: IndexPage,
});

function IndexPage() {
  const navigate = useNavigate();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api.api.projects.$get();
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json() as Promise<Project[]>;
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!isLoading && projects?.length) {
      const lastId = localStorage.getItem("archsem-last-project");
      const target = projects.find((p) => p._id === lastId) ?? projects[0];
      navigate({
        to: "/$projectId/connections",
        params: { projectId: target._id },
        replace: true,
      });
    }
  }, [isLoading, projects, navigate]);

  if (isLoading || projects?.length) {
    return null;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <FolderOpen className="h-10 w-10 text-muted-foreground" />
      <div>
        <h2 className="text-lg font-medium">No projects yet</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Create a project using the <strong>+</strong> button in the sidebar to get started.
        </p>
      </div>
    </div>
  );
}
