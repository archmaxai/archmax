import { useState, useRef, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, MessageSquare } from "lucide-react";
import { cn, Button, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Card } from "@semlayer/ui";
import { toast } from "sonner";
import { MarkdownContent } from "@/components/chat/markdown-components";
import { ToolCallCard } from "@/components/chat/tool-call-card";
import { ChatInput } from "@/components/chat/chat-input";
import {
  parseSSEChunk,
  normalizeMessage,
  appendToken,
  appendToolCallStart,
  updateToolCall,
} from "@/components/chat/agent-chat";
import { getTextContent, type ChatMessage, type ContentSegment, type ToolCallInfo } from "@/lib/chat-types";
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
}

function MessageSegments({ segments }: { segments: ContentSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "text" && seg.content) {
          return <MarkdownContent key={i} content={seg.content} />;
        }
        if (seg.type === "tool_call") {
          return <ToolCallCard key={seg.toolCall.id} tc={seg.toolCall} />;
        }
        return null;
      })}
    </>
  );
}

function PlaygroundPage() {
  const { project } = useProject();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  const { data: conversations = [], refetch: refetchConversations } = useQuery<ConversationListItem[]>({
    queryKey: ["playground-conversations", project._id, selectedAgentId],
    queryFn: async () => {
      if (!selectedAgentId) return [];
      const res = await api.api.projects[":projectId"].playground.conversations.$get({
        param: { projectId: project._id },
        query: { testAgentId: selectedAgentId },
      });
      if (!res.ok) throw new Error("Failed to load conversations");
      return res.json() as Promise<ConversationListItem[]>;
    },
    enabled: !!selectedAgentId,
  });

  useEffect(() => {
    setConversationId(null);
    setMessages([]);
  }, [selectedAgentId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await api.api.projects[":projectId"].playground.conversations[":conversationId"].$get({
        param: { projectId: project._id, conversationId: convId },
      });
      if (!res.ok) throw new Error("Failed to load conversation");
      const conv = await res.json() as { _id: string; messages: ChatMessage[] };
      setConversationId(conv._id);
      setMessages(conv.messages.map(normalizeMessage));
    } catch (err) {
      toast.error("Failed to load conversation");
    }
  }, [project._id]);

  const updateLastAssistant = useCallback(
    (updater: (prev: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = updater(last);
        }
        return next;
      });
    },
    [],
  );

  function handleSSEEvent(event: string, parsed: Record<string, unknown>) {
    switch (event) {
      case "conversation":
        if (parsed.conversationId && typeof parsed.conversationId === "string") {
          setConversationId(parsed.conversationId);
          refetchConversations();
        }
        break;
      case "token":
        if (typeof parsed.content === "string") {
          updateLastAssistant((m) => ({
            ...m,
            segments: appendToken(m.segments, parsed.content as string),
          }));
        }
        break;
      case "tool_call_start": {
        const tc: ToolCallInfo = {
          id: parsed.id as string,
          name: parsed.name as string,
          args: (parsed.args as string) ?? "",
          status: "running" as const,
        };
        updateLastAssistant((m) => ({
          ...m,
          segments: appendToolCallStart(m.segments, tc),
        }));
        break;
      }
      case "tool_call_end":
        updateLastAssistant((m) => ({
          ...m,
          segments: updateToolCall(m.segments, parsed.id as string, {
            result: parsed.result as string,
            status: "completed" as const,
          }),
        }));
        break;
      case "error":
        updateLastAssistant((m) => ({
          ...m,
          segments: appendToken(m.segments, `\n\nError: ${parsed.error ?? "Unknown error"}`),
        }));
        break;
      case "done":
        updateLastAssistant((m) => ({ ...m, isStreaming: false }));
        setIsStreaming(false);
        refetchConversations();
        break;
    }
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming || !selectedAgentId) return;

    setInput("");
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((prev) => [
      ...prev,
      { role: "user", segments: [{ type: "text", content: text }] },
      { role: "assistant", segments: [], isStreaming: true },
    ]);

    try {
      const res = await api.api.projects[":projectId"].playground.chat.$post(
        {
          param: { projectId: project._id },
          json: {
            message: text,
            testAgentId: selectedAgentId,
            conversationId: conversationId ?? undefined,
          },
        },
        { init: { signal: controller.signal } },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        updateLastAssistant((m) => ({
          ...m,
          segments: [{ type: "text", content: `Error: ${(err as Record<string, string>).error ?? "Unknown error"}` }],
          isStreaming: false,
        }));
        setIsStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setIsStreaming(false); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lastDoubleNewline = buffer.lastIndexOf("\n\n");
        if (lastDoubleNewline === -1) continue;

        const complete = buffer.slice(0, lastDoubleNewline + 2);
        buffer = buffer.slice(lastDoubleNewline + 2);

        for (const { event, data } of parseSSEChunk(complete)) {
          try {
            const parsed = JSON.parse(data);
            handleSSEEvent(event, parsed);
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        updateLastAssistant((m) => ({
          ...m,
          segments: getTextContent(m.segments)
            ? m.segments
            : [{ type: "text", content: `Error: ${err instanceof Error ? err.message : "Network error"}` }],
          isStreaming: false,
        }));
      }
    } finally {
      updateLastAssistant((m) => ({ ...m, isStreaming: false }));
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, selectedAgentId, conversationId, project._id, updateLastAssistant, refetchConversations]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const showWelcome = messages.length === 0;

  return (
    <div className="flex h-full">
      <div className="w-64 border-r border-border flex flex-col bg-muted/30">
        <div className="p-4 space-y-3">
          <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
            <SelectTrigger>
              <SelectValue placeholder="Select agent..." />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedAgentId && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setConversationId(null);
                setMessages([]);
              }}
            >
              New Conversation
            </Button>
          )}
        </div>

        <div className="divider-subtle mx-4" />

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {conversations.map((c) => (
              <button
                key={c._id}
                onClick={() => loadConversation(c._id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left",
                  c._id === conversationId
                    ? "bg-foreground/[0.08] font-medium"
                    : "hover:bg-foreground/[0.05] text-muted-foreground",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.title}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!selectedAgentId ? (
          <div className="flex-1 flex items-center justify-center">
            <Card className="p-8 text-center">
              <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Select a test agent to start chatting.
              </p>
            </Card>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1">
              <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
                {showWelcome && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Bot className="h-10 w-10 text-muted-foreground mb-3" />
                    <h2 className="text-lg font-medium mb-1">Playground</h2>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Chat with your test agent to explore and validate semantic models with MCP tools.
                    </p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      msg.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-transparent",
                      )}
                    >
                      <MessageSegments segments={msg.segments} />
                      {msg.isStreaming && msg.segments.length === 0 && (
                        <div className="flex gap-1 py-1">
                          <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                          <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                          <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            <div className="border-t border-border bg-background p-4">
              <div className="mx-auto max-w-3xl">
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSend={sendMessage}
                  onStop={handleStop}
                  isStreaming={isStreaming}
                  disabled={!selectedAgentId}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
