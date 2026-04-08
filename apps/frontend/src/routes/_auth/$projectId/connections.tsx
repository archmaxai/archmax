import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/$projectId/connections")({
  component: ConnectionsLayout,
});

function ConnectionsLayout() {
  return <Outlet />;
}
