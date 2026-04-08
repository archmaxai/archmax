import { createFileRoute, Outlet, Link, useMatch, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  MessageSquare,
  Trash2,
} from "lucide-react";

import { cn, Button, ScrollArea, Skeleton } from "@semlayer/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { SemanticModelExplorer } from "@/components/semantic-model-explorer";
import { ModelsLayoutProvider } from "@/components/model-visualization/models-layout-context";
import { useResizablePanel, PanelResizeHandle } from "@/components/layout/panel-resize-handle";
import { AccordionSection } from "@/components/layout/accordion-section";
import type { ConversationListResponse } from "@/lib/chat-types";

export const Route = createFileRoute("/_auth/$projectId/models")({
  component: ModelsLayout,
});

function ModelsLayout() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { width: panelWidth, onMouseDown: onResizeStart } = useResizablePanel("semlayer-models-panel-width", 256);

  const modelMatch = useMatch({
    from: "/_auth/$projectId/models/$modelName",
    shouldThrow: false,
  });
  const selectedModelName = modelMatch?.params.modelName ?? null;

  const convMatch = useMatch({
    from: "/_auth/$projectId/models/chat/$conversationId",
    shouldThrow: false,
  });
  const activeConvId = convMatch?.params.conversationId;

  const PAGE_SIZE = 10;
  const {
    data: convPages,
    isLoading: listLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["conversations", project._id],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await api.api.projects[":projectId"].conversations.$get({
        param: { projectId: project._id },
        query: { limit: String(PAGE_SIZE), skip: String(pageParam) },
      });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json() as unknown as Promise<ConversationListResponse>;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const conversations = convPages?.pages.flatMap((p) => p.items);

  async function handleDelete(id: string) {
    await api.api.projects[":projectId"].conversations[":id"].$delete({
      param: { projectId: project._id, id },
    });
    queryClient.invalidateQueries({
      queryKey: ["conversations", project._id],
    });
    if (activeConvId === id) {
      navigate({
        to: "/$projectId/models/chat/$conversationId",
        params: { projectId: project._id, conversationId: "new" },
      });
    }
  }

  function handleStreamEnd() {
    queryClient.invalidateQueries({ queryKey: ["semantic-models", project._id] });
    if (selectedModelName) {
      queryClient.invalidateQueries({ queryKey: ["semantic-model", project._id, selectedModelName] });
      queryClient.invalidateQueries({ queryKey: ["semantic-model-yaml", project._id, selectedModelName] });
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex shrink-0 flex-col bg-muted min-h-0" style={{ width: panelWidth }}>
        <ScrollArea className="flex-1 min-h-0 pt-1.5">
            <AccordionSection
              title="History"
              action={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  asChild
                  className="h-5 w-5"
                >
                  <Link
                    to="/$projectId/models/chat/$conversationId"
                    params={{ projectId: project._id, conversationId: "new" }}
                  >
                    <Plus className="h-3 w-3" />
                  </Link>
                </Button>
              }
            >
              <div className="flex flex-col gap-0.5 px-1.5 pb-2">
                {listLoading &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded-lg" />
                  ))}
                {conversations?.map((c) => (
                  <div
                    key={c._id}
                    className={cn(
                      "group flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors cursor-pointer",
                      c._id === activeConvId
                        ? "bg-foreground/[0.08] text-foreground font-medium"
                        : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                    )}
                  >
                    <Link
                      to="/$projectId/models/chat/$conversationId"
                      params={{ projectId: project._id, conversationId: c._id }}
                      className="flex items-center gap-2 flex-1 min-w-0"
                    >
                      <MessageSquare className="h-3 w-3 shrink-0" />
                      <span className="flex-1 truncate text-xs">
                        {c.title && c.title.length > 30
                          ? c.title.slice(0, 30) + "..."
                          : c.title}
                      </span>
                    </Link>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(c._id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
                {hasNextPage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="w-full text-xs text-muted-foreground h-7"
                  >
                    {isFetchingNextPage ? "Loading…" : "Load More"}
                  </Button>
                )}
                {!listLoading && !conversations?.length && (
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                    No conversations yet
                  </p>
                )}
              </div>
            </AccordionSection>

            <div className="divider-subtle mx-3" />

            <AccordionSection title="Models">
              <SemanticModelExplorer
                projectId={project._id}
                selectedModel={selectedModelName}
              />
            </AccordionSection>
        </ScrollArea>
      </div>

      <PanelResizeHandle onMouseDown={onResizeStart} />

      <div className="flex-1 min-w-0 bg-muted">
        <ModelsLayoutProvider value={{ onStreamEnd: handleStreamEnd, selectedModel: selectedModelName }}>
          <Outlet />
        </ModelsLayoutProvider>
      </div>
    </div>
  );
}
