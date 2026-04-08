import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/$projectId/testing/runs")({
  component: RunsLayout,
});

function RunsLayout() {
  return <Outlet />;
}
