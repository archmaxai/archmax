import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Loader2, WifiOff } from "lucide-react";
import { cn, ScrollArea } from "@archmax/ui";
import { toast } from "sonner";
import { MarkdownContent } from "./markdown-components";
import { combineSegments } from "./remark-tool-calls";
import { ChatInput, type UploadedFile } from "./chat-input";
import {
  getTextContent,
  appendToken,
  appendToolCallStart,
  updateToolCall,
  normalizeMessage,
  shouldSyncMessages,
  shouldResetStreamingState,
  type ChatMessage,
  type ContentSegment,
  type ToolCallInfo,
} from "../../lib/chat-types";
import { consumeSSEStream } from "../../lib/sse";
import { api } from "@/lib/api";

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

const MessageSegments = memo(function MessageSegments({
  segments,
}: {
  segments: ContentSegment[];
}) {
  const hasToolCalls = segments.some((s) => s.type === "tool_call");

  const { markdown, toolCallMap } = useMemo(() => {
    if (!hasToolCalls) {
      const text = segments
        .filter((s): s is Extract<ContentSegment, { type: "text" }> => s.type === "text")
        .map((s) => s.content)
        .join("");
      return { markdown: text, toolCallMap: new Map() };
    }
    return combineSegments(segments);
  }, [segments, hasToolCalls]);

  if (!markdown && toolCallMap.size === 0) return null;

  return (
    <MarkdownContent
      content={markdown}
      toolCalls={toolCallMap.size > 0 ? toolCallMap : undefined}
    />
  );
});

/**
 * One chat bubble. Memoized so that unrelated state changes in AgentChat
 * (typing in the input, toggling `isStreaming` at stream end, etc.) don't
 * re-render every prior message — which otherwise forces `react-markdown`
 * to re-parse the full conversation and blocks the main thread.
 *
 * `isReconnecting` is only relevant when the message itself is streaming, so
 * the parent passes `false` for non-streaming messages to keep props stable.
 */
const ChatMessageItem = memo(function ChatMessageItem({
  msg,
  isReconnecting,
}: {
  msg: ChatMessage;
  isReconnecting: boolean;
}) {
  const isUser = msg.role === "user";
  const textContent = isUser ? getTextContent(msg.segments) : "";

  return (
    <div
      className={cn(
        "flex w-full px-4 lg:px-8",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div className="max-w-[95%] md:max-w-[80%]">
        <div
          className={cn(
            "rounded-2xl px-6 py-5 text-sm leading-relaxed",
            isUser
              ? "bg-[oklch(0.25_0_0)] text-white dark:bg-[oklch(0.965_0_0)] dark:text-[oklch(0.145_0_0)]"
              : "bg-card",
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{textContent}</div>
          ) : msg.segments.length > 0 ? (
            <>
              <MessageSegments segments={msg.segments} />
              {msg.isStreaming && isReconnecting && (
                <div className="mt-3 flex items-center gap-2 text-muted-foreground">
                  <WifiOff className="h-3.5 w-3.5" />
                  <span className="text-xs">Reconnecting…</span>
                </div>
              )}
            </>
          ) : msg.isStreaming ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              {isReconnecting ? (
                <>
                  <WifiOff className="h-4 w-4" />
                  <span className="text-xs">Reconnecting…</span>
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Thinking…</span>
                </>
              )}
            </div>
          ) : null}

          {!isUser && msg.error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-xs">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{msg.error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export type ChatRequestFn = (params: {
  projectId: string;
  message: string;
  conversationId?: string;
  signal: AbortSignal;
}) => Promise<Response>;

export type CancelRequestFn = (params: {
  projectId: string;
  conversationId: string;
}) => void;

interface AgentChatProps {
  projectId: string;
  conversationId: string | null;
  initialMessages: ChatMessage[];
  onConversationCreated: (id: string) => void;
  onStreamEnd?: () => void;
  hideInput?: boolean;
  hideMessages?: boolean;
  activeStreamConversationId?: string | null;
  chatRequest?: ChatRequestFn;
  cancelRequest?: CancelRequestFn;
  disableFileUpload?: boolean;
  emptyState?: React.ReactNode;
  /** Title shown on the start page (default: "Semantic Model Builder") */
  emptyStateTitle?: string;
  /** Description shown below the title on the start page */
  emptyStateDescription?: string;
  /** Render content in the bottom-left of the input (e.g. agent selector pills) */
  inputBottomLeft?: React.ReactNode;
  /** Custom placeholder text for the input */
  inputPlaceholder?: string;
  /** Override the subscribe URL prefix for stream reconnection (default: /api/projects/{id}/agent) */
  subscribeUrlPrefix?: string;
  /** Disable sending while still showing the input */
  disableSend?: boolean;
  /** Pre-fill the input textarea with this text (e.g. from an improvement suggestion) */
  initialInput?: string;
}

export function AgentChat({
  projectId,
  conversationId,
  initialMessages,
  onConversationCreated,
  onStreamEnd,
  hideInput,
  hideMessages,
  activeStreamConversationId,
  chatRequest,
  cancelRequest,
  disableFileUpload,
  emptyState,
  emptyStateTitle,
  emptyStateDescription,
  inputBottomLeft,
  inputPlaceholder,
  subscribeUrlPrefix,
  disableSend,
  initialInput,
}: AgentChatProps) {
  const { data: appConfig } = useQuery({
    queryKey: ["app-config"],
    queryFn: async () => {
      const res = await fetch("/api/config");
      return res.json() as Promise<{ githubEnabled: boolean; agentConfigured: boolean }>;
    },
    staleTime: Infinity,
  });
  const agentConfigured = appConfig?.agentConfigured !== false;

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages.map(normalizeMessage),
  );
  const [input, setInput] = useState(initialInput ?? "");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevConvIdRef = useRef(conversationId);
  const isStreamingRef = useRef(false);
  const activeConvIdRef = useRef(conversationId);
  const createdConvIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    activeConvIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    const prev = prevConvIdRef.current;
    prevConvIdRef.current = conversationId;

    if (prev !== conversationId) {
      if (shouldResetStreamingState(prev, conversationId, createdConvIdRef.current)) {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsStreaming(false);
        isStreamingRef.current = false;
        setUploadedFiles([]);
        setInput("");
      } else {
        createdConvIdRef.current = null;
      }
    }

    if (shouldSyncMessages(prev, conversationId, isStreamingRef.current)) {
      setMessages(initialMessages.map(normalizeMessage));
    }
  }, [conversationId, initialMessages]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const handleSSEEventRef = useRef<(event: string, parsed: Record<string, unknown>) => void>(() => {});

  useEffect(() => {
    handleSSEEventRef.current = handleSSEEvent;
  });

  const subscribeUrl = useCallback(
    (convId: string) => {
      const baseUrl = import.meta.env.VITE_API_URL ?? "";
      const prefix = subscribeUrlPrefix ?? `/api/projects/${projectId}/agent`;
      return `${baseUrl}${prefix}/subscribe/${convId}`;
    },
    [projectId, subscribeUrlPrefix],
  );

  /**
   * Try to resume a broken stream via the Redis-buffered subscribe endpoint.
   * Exponential backoff (1s, 2s, 4s…), gives up after MAX_RECONNECT_ATTEMPTS.
   */
  const attemptReconnect = useCallback(
    async (convId: string, signal: AbortSignal): Promise<boolean> => {
      for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
        if (signal.aborted) return false;

        reconnectAttemptRef.current = attempt + 1;
        setIsReconnecting(true);

        const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        if (signal.aborted) return false;

        try {
          const res = await fetch(subscribeUrl(convId), { signal });

          if (res.status === 404) return false;
          if (!res.ok) continue;

          const reader = res.body?.getReader();
          if (!reader) continue;

          setIsReconnecting(false);
          const { receivedDone } = await consumeSSEStream(reader, (event, parsed) => {
            handleSSEEventRef.current(event, parsed);
          });

          if (receivedDone) return true;
        } catch (err) {
          if ((err as Error).name === "AbortError") return false;
        }
      }

      setIsReconnecting(false);
      return false;
    },
    [subscribeUrl],
  );

  /**
   * Consume a reader and, if the stream breaks without a `done` event,
   * automatically attempt reconnection. Returns true if the stream
   * completed cleanly (either directly or via reconnect).
   */
  const consumeWithReconnect = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      convId: string,
      signal: AbortSignal,
      onEvent: (event: string, parsed: Record<string, unknown>) => void,
    ): Promise<boolean> => {
      const { receivedDone } = await consumeSSEStream(reader, onEvent);
      if (receivedDone || signal.aborted) return receivedDone;
      return attemptReconnect(convId, signal);
    },
    [attemptReconnect],
  );

  useEffect(() => {
    if (!activeStreamConversationId || isStreamingRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.isStreaming) return prev;
      return [...prev, { role: "assistant", segments: [], isStreaming: true }];
    });

    (async () => {
      try {
        const res = await fetch(
          subscribeUrl(activeStreamConversationId),
          { signal: controller.signal },
        );
        if (!res.ok) {
          setIsStreaming(false);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.isStreaming) return prev.slice(0, -1);
            return prev;
          });
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) { setIsStreaming(false); return; }

        await consumeWithReconnect(
          reader,
          activeStreamConversationId,
          controller.signal,
          (event, parsed) => handleSSEEventRef.current(event, parsed),
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError" && !controller.signal.aborted) {
          await attemptReconnect(activeStreamConversationId, controller.signal);
        }
      } finally {
        reconnectAttemptRef.current = 0;
        setIsReconnecting(false);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return [...prev.slice(0, -1), { ...last, isStreaming: false }];
          }
          return prev;
        });
        setIsStreaming(false);
        abortRef.current = null;
        onStreamEnd?.();
      }
    })();

    return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStreamConversationId, subscribeUrl, consumeWithReconnect, attemptReconnect]);

  const handleFileUpload = useCallback(async (file: File): Promise<UploadedFile> => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const baseUrl = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(
        `${baseUrl}/api/projects/${projectId}/documents/upload`,
        { method: "POST", body: formData, credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = (data as { error?: string } | null)?.error ?? `Upload failed (${res.status})`;
        throw new Error(msg);
      }
      const meta = (await res.json()) as UploadedFile;
      setUploadedFiles((prev) => [...prev.filter((f) => f.filename !== meta.filename), meta]);
      toast.success(`Uploaded ${meta.filename}`);
      return meta;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, [projectId]);

  const handleRemoveFile = useCallback((filename: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.filename !== filename));
  }, []);

  const sendMessage = useCallback(async () => {
    const files = uploadedFiles;
    const userText = input.trim();
    if (!userText && files.length === 0) return;
    if (isStreaming) return;

    const filePrefix = files.length > 0
      ? `[Uploaded ${files.length === 1 ? "document" : "documents"}: ${files.map((f) => f.filename).join(", ")}. Use the read_document tool to read ${files.length === 1 ? "it" : "them"}.]\n\n`
      : "";
    const text = filePrefix + (userText || "Please read the uploaded document and use it for context.");

    setInput("");
    setUploadedFiles([]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const displayText = userText || "Use the uploaded document for context.";
    const userSegments: ContentSegment[] = [];
    if (files.length > 0) {
      userSegments.push({
        type: "text",
        content: files.map((f) => `📎 ${f.filename}`).join("\n") + "\n\n",
      });
    }
    userSegments.push({ type: "text", content: displayText });

    setMessages((prev) => [
      ...prev,
      { role: "user", segments: userSegments },
      { role: "assistant", segments: [], isStreaming: true },
    ]);

    try {
      const res = chatRequest
        ? await chatRequest({
            projectId,
            message: text,
            conversationId: conversationId ?? undefined,
            signal: controller.signal,
          })
        : await api.api.projects[":projectId"].agent.chat.$post(
            {
              param: { projectId },
              json: {
                message: text,
                conversationId: conversationId ?? undefined,
              },
            },
            { init: { signal: controller.signal } },
          );

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        updateLastAssistant((m) => ({
          ...m,
          segments: [{ type: "text", content: `Error: ${(err as Record<string, string>).error ?? "Unknown error"}` }],
          isStreaming: false,
        }));
        setIsStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setIsStreaming(false);
        return;
      }

      const convId = activeConvIdRef.current;
      const recovered = convId
        ? await consumeWithReconnect(reader, convId, controller.signal, handleSSEEvent)
        : (await consumeSSEStream(reader, handleSSEEvent)).receivedDone;

      if (!recovered && !controller.signal.aborted) {
        updateLastAssistant((m) => {
          const hasContent = getTextContent(m.segments);
          if (!hasContent) return { ...m, error: "Connection lost. Please try again." };
          return m;
        });
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const convId = activeConvIdRef.current;
        const recovered = convId && !controller.signal.aborted
          ? await attemptReconnect(convId, controller.signal)
          : false;
        if (!recovered) {
          updateLastAssistant((m) => {
            const hasContent = getTextContent(m.segments);
            return {
              ...m,
              segments: hasContent
                ? m.segments
                : [{ type: "text", content: `Error: ${err instanceof Error ? err.message : "Network error"}` }],
              isStreaming: false,
            };
          });
        }
      }
    } finally {
      reconnectAttemptRef.current = 0;
      setIsReconnecting(false);
      updateLastAssistant((m) => ({ ...m, isStreaming: false }));
      setIsStreaming(false);
      abortRef.current = null;
      onStreamEnd?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isStreaming, projectId, conversationId, uploadedFiles, chatRequest, consumeWithReconnect, attemptReconnect]);

  function handleSSEEvent(
    event: string,
    parsed: Record<string, unknown>,
  ) {
    if (event === "conversation" && parsed.conversationId) {
      activeConvIdRef.current = parsed.conversationId as string;
      createdConvIdRef.current = parsed.conversationId as string;
      onConversationCreated(parsed.conversationId as string);
    } else if (event === "token" && typeof parsed.content === "string") {
      updateLastAssistant((m) => ({
        ...m,
        segments: appendToken(m.segments, parsed.content as string),
      }));
    } else if (event === "tool_call_start") {
      const tc: ToolCallInfo = {
        id: parsed.id as string,
        name: parsed.name as string,
        args: (parsed.args as string) ?? "",
        status: "running",
      };
      updateLastAssistant((m) => ({
        ...m,
        segments: appendToolCallStart(m.segments, tc),
      }));
    } else if (event === "tool_call_end") {
      updateLastAssistant((m) => ({
        ...m,
        segments: updateToolCall(m.segments, parsed.id as string, {
          status: "completed",
          result: parsed.result as string,
        }),
      }));
    } else if (event === "error") {
      updateLastAssistant((m) => ({
        ...m,
        error: (parsed.error as string) ?? "Unknown error",
      }));
    } else if (event === "text" && typeof parsed.content === "string") {
      updateLastAssistant((m) => ({
        ...m,
        segments: [{ type: "text", content: parsed.content as string }],
      }));
    } else if (event === "tool_call") {
      const tc: ToolCallInfo = {
        id: crypto.randomUUID(),
        name: parsed.name as string,
        args: (parsed.args as string) ?? "",
        status: "completed",
      };
      updateLastAssistant((m) => ({
        ...m,
        segments: appendToolCallStart(m.segments, tc),
      }));
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setIsStreaming(false);

    const convId = activeConvIdRef.current;
    if (convId) {
      if (cancelRequest) {
        cancelRequest({ projectId, conversationId: convId });
      } else {
        api.api.projects[":projectId"].agent.cancel[":conversationId"]
          .$post({ param: { projectId, conversationId: convId } })
          .catch(() => {});
      }
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className={cn("relative flex flex-col", !hideMessages && "h-full")}>
      {!hideMessages && (
        <>
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="pt-16 pb-40 space-y-4">
                {!hasMessages && (emptyState ?? (
                  <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 pt-6 content-tight">
                    <div className="text-center max-w-lg">
                      <h3 className="text-heading text-lg">
                        {emptyStateTitle ?? "Semantic Model Builder"}
                      </h3>
                      {!agentConfigured ? (
                        <div className="mt-4 flex flex-col items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-5 py-4 text-left text-sm">
                          <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            AI agent is not configured
                          </div>
                          <p className="text-foreground/70">
                            Set an API key for an OpenAI-compatible provider to enable the agent. Add the following to your <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> file or Docker Compose environment:
                          </p>
                          <div className="w-full rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs leading-relaxed text-foreground/80">
                            <div><span className="text-amber-700 dark:text-amber-400">AGENT_API_KEY</span>=your-api-key <span className="text-muted-foreground"># required</span></div>
                            <div><span className="text-muted-foreground">AGENT_API_BASE_URL=https://openrouter.ai/api/v1</span></div>
                            <div><span className="text-muted-foreground">AGENT_MODEL=anthropic/claude-sonnet-4</span></div>
                          </div>
                          <p className="text-foreground/60 text-xs">
                            Supported providers: OpenRouter, OpenAI, Azure OpenAI, Ollama, or any OpenAI-compatible endpoint. Restart the server after updating.
                          </p>
                        </div>
                      ) : (
                        <p className="text-foreground/60 text-sm mt-1.5">
                          {emptyStateDescription ??
                            "Ask me to explore your database schemas and create semantic models. I can read tables, run queries, and write model definitions."}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {messages.map((msg, i) => (
                  <ChatMessageItem
                    key={i}
                    msg={msg}
                    isReconnecting={!!msg.isStreaming && isReconnecting}
                  />
                ))}

                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            {hasMessages && (
              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-muted via-muted/80 to-transparent"
                aria-hidden="true"
              />
            )}
          </div>
        </>
      )}

      {!hideInput && (
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={sendMessage}
          onStop={handleStop}
          isStreaming={isStreaming}
          hasMessages={hasMessages || !!hideMessages}
          focusRequestId={focusRequestId}
          placeholder={inputPlaceholder}
          bottomLeft={inputBottomLeft}
          disableSend={disableSend || !agentConfigured}
          {...(disableFileUpload ? {} : {
            onFileUpload: handleFileUpload,
            uploadedFiles,
            onRemoveFile: handleRemoveFile,
            isUploading,
          })}
        />
      )}
    </div>
  );
}
