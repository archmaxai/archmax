import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Code, TreePine, Network, Loader2, Download } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent, Button } from "@archmax/ui";
import { toast } from "sonner";
import { ModelYamlView } from "./model-yaml-view";
import { ModelTreeView } from "./model-tree-view";
import { ModelGraphView } from "./model-graph-view";
import { useModelDiff } from "./use-model-diff";
import type { SemanticModelFull } from "./types";
import { api } from "@/lib/api";

const DEFAULT_TAB = "graph";
const TAB_STORAGE_PREFIX = "archmax:model-tab:";

function getTabPreference(modelName: string): string {
  try {
    return localStorage.getItem(`${TAB_STORAGE_PREFIX}${modelName}`) ?? DEFAULT_TAB;
  } catch {
    return DEFAULT_TAB;
  }
}

function setTabPreference(modelName: string, tab: string) {
  try {
    localStorage.setItem(`${TAB_STORAGE_PREFIX}${modelName}`, tab);
  } catch {
    // ignore quota errors
  }
}

interface ModelVisualizationProps {
  projectId: string;
  modelName: string;
}

export function ModelVisualization({
  projectId,
  modelName,
}: ModelVisualizationProps) {
  const [tab, setTab] = useState(() => getTabPreference(modelName));

  useEffect(() => {
    setTab(getTabPreference(modelName));
  }, [modelName]);

  const handleTabChange = useCallback(
    (value: string) => {
      setTab(value);
      setTabPreference(modelName, value);
    },
    [modelName],
  );

  const { data: model, isLoading } = useQuery({
    queryKey: ["semantic-model", projectId, modelName],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["semantic-models"][":name"].$get({
        param: { projectId, name: modelName },
      });
      if (!res.ok) throw new Error("Failed to fetch model");
      return res.json() as unknown as SemanticModelFull;
    },
    refetchInterval: 10_000,
  });

  const diff = useModelDiff(model ?? null);

  const handleDownload = useCallback(async () => {
    try {
      const res = await api.api.projects[":projectId"]["semantic-models"][":name"].yaml.$get({
        param: { projectId, name: modelName },
      });
      if (!res.ok) throw new Error("Failed to fetch YAML");
      const text = await res.text();
      const blob = new Blob([text], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${modelName}.yaml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  }, [projectId, modelName]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Model not found
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs value={tab} onValueChange={handleTabChange} className="flex-1 min-h-0 flex flex-col">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pt-2">
          <div />
          <TabsList variant="pill">
            <TabsTrigger value="graph">
              <Network className="h-3.5 w-3.5" />
              Graph
            </TabsTrigger>
            <TabsTrigger value="tree">
              <TreePine className="h-3.5 w-3.5" />
              Tree
            </TabsTrigger>
            <TabsTrigger value="yaml">
              <Code className="h-3.5 w-3.5" />
              YAML
            </TabsTrigger>
          </TabsList>
          <div className="flex justify-end">
            <Button variant="ghost" size="icon-sm" onClick={handleDownload} title="Download YAML">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <TabsContent value="graph" className="flex-1 min-h-0">
          <ModelGraphView
            key={modelName}
            projectId={projectId}
            modelName={modelName}
            model={model}
            diff={diff}
            className="h-full"
          />
        </TabsContent>

        <TabsContent value="tree" className="flex-1 min-h-0">
          <ModelTreeView model={model} diff={diff} className="h-full" />
        </TabsContent>

        <TabsContent value="yaml" className="flex-1 min-h-0">
          <ModelYamlView projectId={projectId} modelName={modelName} className="h-full" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
