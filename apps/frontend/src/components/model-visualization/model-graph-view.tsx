import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { cn } from "@semlayer/ui";
import { api } from "@/lib/api";
import { DatasetNode, type DatasetNodeType, type DatasetNodeData, type FieldPreview } from "./dataset-node";
import type { SemanticModelFull, ModelDiff, CustomExtension } from "./types";
import { getRelationshipColumns, getFieldDataType } from "./types";

const POSITION_VENDOR = "COMMON";
const FIELD_PREVIEW_COUNT = 5;
const NODE_WIDTH = 260;
const NODE_HEIGHT = 180;

const nodeTypes = { dataset: DatasetNode };

function parsePosition(extensions?: CustomExtension[]): { x: number; y: number } | null {
  if (!extensions) return null;
  for (const ext of extensions) {
    try {
      const d = JSON.parse(ext.data);
      if (typeof d.graph_x === "number" && typeof d.graph_y === "number") {
        return { x: d.graph_x, y: d.graph_y };
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return null;
}

function getDescription(ds: SemanticModelFull["datasets"][number]): string | undefined {
  if (ds.description) return ds.description;
  const ctx = (ds as Record<string, unknown>).ai_context;
  if (typeof ctx === "string") return ctx;
  if (ctx && typeof ctx === "object" && "instructions" in ctx) {
    return (ctx as { instructions?: string }).instructions;
  }
  return undefined;
}

function autoLayout(nodes: DatasetNodeType[], edges: Edge[]): DatasetNodeType[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 80, nodesep: 40 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });
}

function buildNodesAndEdges(
  model: SemanticModelFull,
  diff: ModelDiff,
): { nodes: DatasetNodeType[]; edges: Edge[]; didAutoLayout: boolean } {
  const nodesWithSaved: DatasetNodeType[] = model.datasets.map((ds) => {
    const saved = parsePosition(ds.custom_extensions);
    const fieldPreviews: FieldPreview[] = ds.fields
      .slice(0, FIELD_PREVIEW_COUNT)
      .map((f) => ({ name: f.name, dataType: getFieldDataType(f) }));
    return {
      id: ds.name,
      type: "dataset" as const,
      position: saved ?? { x: 0, y: 0 },
      data: {
        label: ds.name,
        source: ds.source,
        fieldCount: ds.fields.length,
        description: getDescription(ds),
        fieldPreviews,
        highlighted: diff.addedDatasets.has(ds.name) || diff.modifiedDatasets.has(ds.name),
      } satisfies DatasetNodeData,
    };
  });

  const edges: Edge[] = model.relationships.map((r) => {
    const cols = getRelationshipColumns(r);
    return {
      id: r.name,
      source: r.from,
      target: r.to,
      label: cols.from.join(", "),
      type: "default",
      animated: diff.addedRelationships.has(r.name),
      style: { stroke: "var(--color-muted-foreground)", strokeWidth: 1.5 },
      labelStyle: { fontSize: 10, fill: "var(--color-muted-foreground)" },
    };
  });

  const needsLayout = nodesWithSaved.some(
    (n) => n.position.x === 0 && n.position.y === 0 && !parsePosition(model.datasets.find((d) => d.name === n.id)?.custom_extensions),
  );

  if (needsLayout) {
    return { nodes: autoLayout(nodesWithSaved, edges), edges, didAutoLayout: true };
  }

  return { nodes: nodesWithSaved, edges, didAutoLayout: false };
}

interface ModelGraphViewProps {
  projectId: string;
  modelName: string;
  model: SemanticModelFull;
  diff: ModelDiff;
  className?: string;
}

export function ModelGraphView({
  projectId,
  modelName,
  model,
  diff,
  className,
}: ModelGraphViewProps) {
  const initial = useMemo(() => buildNodesAndEdges(model, diff), [model, diff]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);
  const hasSavedAutoLayout = useRef(false);

  const saveNodePositions = useCallback(
    (nodesToSave: DatasetNodeType[]) => {
      for (const node of nodesToSave) {
        const ds = model.datasets.find((d) => d.name === node.id);
        if (!ds) continue;

        const existing = (ds.custom_extensions ?? []).filter((e) => {
          try {
            const d = JSON.parse(e.data);
            return typeof d.graph_x !== "number";
          } catch {
            return true;
          }
        });
        const extensions = [
          ...existing,
          {
            vendor_name: POSITION_VENDOR,
            data: JSON.stringify({ graph_x: Math.round(node.position.x), graph_y: Math.round(node.position.y) }),
          },
        ];

        api.api.projects[":projectId"]["semantic-models"][":name"].datasets[":datasetName"].extensions.$patch({
          param: { projectId, name: modelName, datasetName: node.id },
          json: { custom_extensions: extensions },
        }).catch(() => {});
      }
    },
    [projectId, modelName, model.datasets],
  );

  useEffect(() => {
    if (initial.didAutoLayout && !hasSavedAutoLayout.current) {
      hasSavedAutoLayout.current = true;
      saveNodePositions(initial.nodes);
    }
  }, [initial.didAutoLayout, initial.nodes, saveNodePositions]);

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, _node: Node, allNodes: Node[]) => {
      saveNodePositions(allNodes as DatasetNodeType[]);
    },
    [saveNodePositions],
  );

  return (
    <div className={cn("h-full", className)}>
      <ReactFlow<DatasetNodeType>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeStrokeWidth={3}
          className="!bg-muted/50 !border-border rounded-lg"
        />
      </ReactFlow>
    </div>
  );
}
