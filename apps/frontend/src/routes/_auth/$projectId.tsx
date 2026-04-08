import { useEffect } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ProjectProvider, type Project } from "@/lib/project-context";

export const Route = createFileRoute("/_auth/$projectId")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await api.api.projects[":id"].$get({
        param: { id: projectId },
      });
      if (!res.ok) throw new Error("Failed to load project");
      return res.json() as Promise<Project>;
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (project) {
      localStorage.setItem("archsem-last-project", project._id);
    }
  }, [project]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading project...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-destructive text-sm">
          Could not load this project. It may have been deleted.
        </p>
        <p className="text-muted-foreground text-xs">
          Select another project from the sidebar.
        </p>
      </div>
    );
  }

  return (
    <ProjectProvider project={project}>
      <Outlet />
    </ProjectProvider>
  );
}
