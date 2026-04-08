import { createFileRoute, Outlet, redirect, useMatch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import type { Project } from "@/lib/project-context";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (!data) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  const projectMatch = useMatch({
    from: "/_auth/$projectId",
    shouldThrow: false,
  });
  const projectId = projectMatch?.params.projectId;

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await api.api.projects[":id"].$get({
        param: { id: projectId! },
      });
      if (!res.ok) return null;
      return res.json() as Promise<Project>;
    },
    enabled: !!projectId,
  });

  return (
    <AppShell project={project ?? null}>
      <Outlet />
    </AppShell>
  );
}
