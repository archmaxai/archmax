import { useRef, useCallback, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { AgentChat } from "@/components/chat/agent-chat";
import { useModelsLayout } from "@/components/model-visualization/models-layout-context";
import type { ChatMessage, ConversationFull } from "@/lib/chat-types";

const EMPTY_MESSAGES: ChatMessage[] = [];

export const Route = createFileRoute(
  "/_auth/$projectId/models/chat/$conversationId",
)({
  component: ModelsChat,
  validateSearch: (search: Record<string, unknown>) => ({
    prefill: typeof search.prefill === "string" ? search.prefill : undefined,
  }),
});

function ModelsChat() {
  const { projectId, conversationId } = Route.useParams();
  const { prefill } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = conversationId === "new";

  const { onStreamEnd } = useModelsLayout();

  const ownedConvIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationId !== ownedConvIdRef.current) {
      ownedConvIdRef.current = null;
    }
  }, [conversationId]);

  const shouldFetch =
    !isNew && conversationId !== ownedConvIdRef.current;

  const { data: activeConv } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"].conversations[
        ":id"
      ].$get({
        param: { projectId, id: conversationId },
      });
      if (!res.ok) throw new Error("Conversation not found");
      return res.json() as unknown as ConversationFull;
    },
    enabled: shouldFetch,
    refetchInterval: shouldFetch ? 10_000 : false,
  });

  const handleConversationCreated = useCallback(
    (id: string) => {
      ownedConvIdRef.current = id;
      navigate({
        to: "/$projectId/models/chat/$conversationId",
        params: { projectId, conversationId: id },
        search: (prev) => prev,
        replace: true,
      });
      queryClient.invalidateQueries({
        queryKey: ["conversations", projectId],
      });
    },
    [projectId, navigate, queryClient],
  );

  const activeStreamId =
    activeConv?.isStreaming && !isNew ? conversationId : null;

  return (
    <div className="relative flex h-full flex-col">
      <AgentChat
        projectId={projectId}
        conversationId={isNew ? null : conversationId}
        initialMessages={activeConv?.messages ?? EMPTY_MESSAGES}
        onConversationCreated={handleConversationCreated}
        onStreamEnd={onStreamEnd}
        activeStreamConversationId={activeStreamId}
        initialInput={isNew ? prefill : undefined}
        inputBottomLeft={
          <span className="inline-flex items-center rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
            Semantic Model Builder
          </span>
        }
      />
    </div>
  );
}
