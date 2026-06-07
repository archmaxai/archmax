import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Code, TreePine, Network, Loader2, Download, AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent, Button } from "@archmax/ui";
import { toast } from "sonner";
import { ModelYamlView } from "./model-yaml-view";
import { ModelTreeView } from "./model-tree-view";
import { ModelGraphView } from "./model-graph-view";
import { DatasetDetailPanel } from "./dataset-detail-panel";
import { useModelDiff } from "./use-model-diff";
import type { SemanticModelFull } from "./types";
import { PanelResizeHandle, useResizablePanel } from "@/components/layout/panel-resize-handle";
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
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const { width: panelWidth, onMouseDown: onPanelResize } = useResizablePanel(
    "archmax:dataset-panel-width",
    360,
    280,
    560,
    true,
  );

  useEffect(() => {
    setTab(getTabPreference(modelName));
    setSelectedDataset(null);
    setPanelOpen(false);
  }, [modelName]);

  const handleSelectDataset = useCallback((name: string | null) => {
    setSelectedDataset(name);
    setPanelOpen(name !== null);
  }, []);

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

  const selectedDatasetData = selectedDataset
    ? model?.datasets.find((d) => d.name === selectedDataset) ?? null
    : null;

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

  const showPanel = tab === "graph" && panelOpen && !!selectedDatasetData && !model.hasConflicts;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
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
            {model.hasConflicts ? (
              <ConflictBanner />
            ) : (
              <ModelGraphView
                key={modelName}
                projectId={projectId}
                modelName={modelName}
                model={model}
                diff={diff}
                className="h-full"
                selectedDataset={selectedDataset}
                onSelectDataset={handleSelectDataset}
              />
            )}
          </TabsContent>

          <TabsContent value="tree" className="flex-1 min-h-0">
            {model.hasConflicts ? (
              <ConflictBanner />
            ) : (
              <ModelTreeView model={model} diff={diff} className="h-full" />
            )}
          </TabsContent>

          <TabsContent value="yaml" className="flex-1 min-h-0">
            <ModelYamlView projectId={projectId} modelName={modelName} className="h-full" />
          </TabsContent>
        </Tabs>
      </div>

      {showPanel && selectedDatasetData && (
        <>
          <PanelResizeHandle onMouseDown={onPanelResize} />
          <div
            className="h-full shrink-0 animate-in slide-in-from-right duration-200"
            style={{ width: panelWidth }}
          >
            <DatasetDetailPanel
              projectId={projectId}
              modelName={modelName}
              dataset={selectedDatasetData}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ConflictBanner() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm font-medium">Merge conflicts detected</p>
        <p className="text-sm text-muted-foreground">
          This model has merge conflicts that must be resolved before it can be
          visualized. Switch to the YAML tab to see the conflict markers and
          resolve them manually or using the chat agent.
        </p>
      </div>
    </div>
  );
}
