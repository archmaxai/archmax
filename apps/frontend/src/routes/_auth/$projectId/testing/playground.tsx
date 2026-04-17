import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, Plus, Trash2 } from "lucide-react";
import { cn, Button, ScrollArea, Skeleton } from "@archmax/ui";
import { toast } from "sonner";
import { AgentChat, type ChatRequestFn, type CancelRequestFn } from "@/components/chat/agent-chat";
import { InputPill, type InputPillOption } from "@/components/chat/chat-input";
import { AccordionSection } from "@/components/layout/accordion-section";
import { useResizablePanel, PanelResizeHandle } from "@/components/layout/panel-resize-handle";
import type { ChatMessage } from "@/lib/chat-types";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

export const Route = createFileRoute("/_auth/$projectId/testing/playground")({
  component: PlaygroundPage,
});

interface TestAgentItem {
  _id: string;
  name: string;
  semanticModels: string[];
  llmModel: string;
}

interface ConversationListItem {
  _id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isStreaming?: boolean;
}

interface ConversationFull {
  _id: string;
  title: string;
  testAgent: string;
  messages: ChatMessage[];
  isStreaming?: boolean;
}

const EMPTY_MESSAGES: ChatMessage[] = [];

function PlaygroundPage() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const { width: panelWidth, onMouseDown: onResizeStart } = useResizablePanel("archmax-playground-panel-width", 256);
  const storageKey = `archmax-playground-agent-${project._id}`;
  const [selectedAgentId, setSelectedAgentId] = useState<string>(() => localStorage.getItem(storageKey) ?? "");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);

  const ownedConvIdRef = useRef<string | null>(null);

  const { data: agents = [] } = useQuery<TestAgentItem[]>({
    queryKey: ["test-agents", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["test-agents"].$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to load agents");
      return res.json() as Promise<TestAgentItem[]>;
    },
  });

  useEffect(() => {
    if (agents.length === 0 || conversationId) return;
    const stored = localStorage.getItem(storageKey);
    const valid = stored && agents.some((a) => a._id === stored);
    if (valid) {
      setSelectedAgentId(stored);
    } else {
      setSelectedAgentId(agents[0]._id);
    }
  }, [agents, storageKey, conversationId]);

  const agentPillOptions: InputPillOption[] = useMemo(
    () => agents.map((a) => ({ id: a._id, label: a.name, detail: a.llmModel })),
    [agents],
  );

  const selectedAgentName = agents.find((a) => a._id === selectedAgentId)?.name;

  const { data: conversations = [], isLoading: listLoading } = useQuery<ConversationListItem[]>({
    queryKey: ["playground-conversations", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"].playground.conversations.$get({
        param: { projectId: project._id },
        query: {},
      });
      if (!res.ok) throw new Error("Failed to load conversations");
      return res.json() as Promise<ConversationListItem[]>;
    },
    refetchInterval: 10_000,
  });

  const shouldFetch = !!conversationId && conversationId !== ownedConvIdRef.current;

  const { data: activeConv } = useQuery({
    queryKey: ["playground-conversation", conversationId],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"].playground.conversations[":conversationId"].$get({
        param: { projectId: project._id, conversationId: conversationId! },
      });
      if (!res.ok) throw new Error("Failed to load conversation");
      return res.json() as unknown as ConversationFull;
    },
    enabled: shouldFetch,
    refetchInterval: shouldFetch ? 10_000 : false,
  });

  useEffect(() => {
    if (activeConv?.testAgent && activeConv.testAgent !== selectedAgentId) {
      setSelectedAgentId(activeConv.testAgent);
      localStorage.setItem(storageKey, activeConv.testAgent);
    }
  }, [activeConv?.testAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAgentChange = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    localStorage.setItem(storageKey, agentId);
  }, [storageKey]);

  const handleNewConversation = useCallback(() => {
    ownedConvIdRef.current = null;
    setConversationId(null);
    setChatKey((k) => k + 1);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    ownedConvIdRef.current = id;
    setConversationId(id);
    queryClient.invalidateQueries({ queryKey: ["playground-conversations", project._id] });
  }, [project._id, queryClient]);

  const handleStreamEnd = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["playground-conversations", project._id] });
  }, [project._id, queryClient]);

  const handleDeleteConversation = useCallback(async (convId: string) => {
    try {
      await api.api.projects[":projectId"].playground.conversations[":conversationId"].$delete({
        param: { projectId: project._id, conversationId: convId },
      });
      queryClient.invalidateQueries({ queryKey: ["playground-conversations", project._id] });
      if (conversationId === convId) {
        ownedConvIdRef.current = null;
        setConversationId(null);
        setChatKey((k) => k + 1);
      }
    } catch {
      toast.error("Conversation could not be deleted");
    }
  }, [project._id, conversationId, queryClient]);

  const chatRequest: ChatRequestFn = useCallback(async ({ projectId, message, conversationId: convId, signal }) => {
    return api.api.projects[":projectId"].playground.chat.$post(
      {
        param: { projectId },
        json: {
          message,
          testAgentId: selectedAgentId,
          conversationId: convId,
        },
      },
      { init: { signal } },
    );
  }, [selectedAgentId]);

  const cancelRequest: CancelRequestFn = useCallback(({ projectId, conversationId: convId }) => {
    const baseUrl = import.meta.env.VITE_API_URL ?? "";
    fetch(`${baseUrl}/api/projects/${projectId}/playground/cancel/${convId}`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, []);

  const activeStreamId =
    activeConv?.isStreaming && conversationId ? conversationId : null;

  return (
    <div className="flex h-full">
      {/* Sidebar — matches semantic models layout */}
      <div className="flex shrink-0 flex-col bg-muted min-h-0" style={{ width: panelWidth }}>
        <ScrollArea className="flex-1 min-h-0 pt-1.5">
          <AccordionSection
            title="History"
            action={
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-5 w-5 bg-foreground text-background hover:bg-foreground/80 hover:text-background rounded-full"
                onClick={handleNewConversation}
              >
                <Plus className="h-3 w-3" />
              </Button>
            }
          >
            <div className="flex flex-col gap-0.5 px-1.5 pb-2">
              {listLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
                ))}
              {conversations.map((c) => (
                <div
                  key={c._id}
                  className={cn(
                    "group flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] transition-colors cursor-pointer",
                    c._id === conversationId
                      ? "bg-foreground/[0.08] text-foreground font-medium"
                      : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  <button
                    onClick={() => {
                      ownedConvIdRef.current = null;
                      setConversationId(c._id);
                      setChatKey((k) => k + 1);
                    }}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    {c.isStreaming ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="flex-1 truncate">
                      {c.title && c.title.length > 25 ? c.title.slice(0, 25) + "…" : c.title}
                    </span>
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(c._id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
              {!listLoading && conversations.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                  No conversations yet
                </p>
              )}
            </div>
          </AccordionSection>
        </ScrollArea>
      </div>

      <PanelResizeHandle onMouseDown={onResizeStart} />

      {/* Main chat area */}
      <div className="flex-1 min-w-0 bg-muted">
        <AgentChat
          key={chatKey}
          projectId={project._id}
          conversationId={conversationId}
          initialMessages={activeConv?.messages ?? EMPTY_MESSAGES}
          onConversationCreated={handleConversationCreated}
          onStreamEnd={handleStreamEnd}
          chatRequest={selectedAgentId ? chatRequest : undefined}
          cancelRequest={cancelRequest}
          activeStreamConversationId={activeStreamId}
          subscribeUrlPrefix={`/api/projects/${project._id}/playground`}
          disableFileUpload
          disableSend={!selectedAgentId}
          inputPlaceholder={selectedAgentId ? "Chat with your test agent..." : "Select a test agent to start..."}
          inputBottomLeft={
            <InputPill
              options={agentPillOptions}
              value={selectedAgentId}
              onChange={handleAgentChange}
              placeholder="Select agent"
              emptyLabel="Create an agent to get started"
            />
          }
          emptyStateTitle={selectedAgentName ?? "Playground"}
          emptyStateDescription={
            selectedAgentId
              ? "Chat with your test agent to explore and validate semantic models."
              : "Select a test agent from the input bar below to start chatting."
          }
        />
      </div>
    </div>
  );
}
