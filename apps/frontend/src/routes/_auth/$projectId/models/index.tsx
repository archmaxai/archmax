import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/$projectId/models/")({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/$projectId/models/chat/$conversationId",
      params: { projectId: params.projectId, conversationId: "new" },
      search,
    });
  },
});
