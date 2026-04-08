import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Database, Loader2 } from "lucide-react";
import { cn } from "@semlayer/ui";
import { api } from "@/lib/api";

interface SemanticModelSummary {
  name: string;
  description?: string;
  datasets: unknown[];
  metrics: unknown[];
}

interface SemanticModelExplorerProps {
  projectId: string;
  selectedModel: string | null;
}

export function SemanticModelExplorer({
  projectId,
  selectedModel,
}: SemanticModelExplorerProps) {
  const { data: models, isLoading } = useQuery({
    queryKey: ["semantic-models", projectId],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["semantic-models"].$get({
        param: { projectId },
      });
      if (!res.ok) throw new Error("Failed to fetch models");
      return res.json() as unknown as Promise<SemanticModelSummary[]>;
    },
    refetchInterval: 10_000,
  });

  return (
    <div className="flex flex-col">
      <div className="px-1 pb-2">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !models?.length && (
          <p className="px-3 py-6 text-xs text-muted-foreground text-center">
            No models yet. Use the chat to create semantic models from your
            database schemas.
          </p>
        )}

        {models?.map((model) => (
          <Link
            key={model.name}
            to="/$projectId/models/$modelName"
            params={{ projectId, modelName: model.name }}
            className={cn(
              "flex w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors",
              selectedModel === model.name
                ? "bg-foreground/[0.08] text-foreground font-medium"
                : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
            )}
          >
            <Database className="h-3 w-3 shrink-0" />
            <span className="truncate">{model.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/60">
              {model.datasets.length}ds
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
