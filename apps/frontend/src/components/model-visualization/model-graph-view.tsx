import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Edge,
  type Node,
  type OnNodesChange,
  type Viewport,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { Maximize2 } from "lucide-react";
import { cn } from "@archmax/ui";
import { api } from "@/lib/api";
import { DatasetNode, type DatasetNodeType, type DatasetNodeData, type FieldPreview } from "./dataset-node";
import { GroupBoxNode, type GroupBoxNodeType, type GroupBoxNodeData } from "./group-box-node";
import { GraphContextMenu, CreateGroupPopover, RenameGroupPopover, type ContextMenuState } from "./graph-context-menu";
import type { SemanticModelFull, ModelDiff, CustomExtension, DatasetGroup } from "./types";
import {
  getRelationshipColumns,
  getFieldDataType,
  getAiInstructions,
  parseDatasetGroups,
  serializeDatasetGroups,
  getGroupColor,
  GROUP_COLORS,
} from "./types";

const POSITION_VENDOR = "COMMON";
const FIELD_PREVIEW_COUNT = 5;
const NODE_WIDTH = 260;
const NODE_HEIGHT = 180;
const GROUP_PADDING = 28;
const GROUP_LABEL_HEIGHT = 24;
const GRID_SIZE = 10;

const nodeTypes = { dataset: DatasetNode, "group-box": GroupBoxNode };

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
  return getAiInstructions(ds.ai_context) || undefined;
}

function autoLayout(
  nodes: DatasetNodeType[],
  edges: Edge[],
  groups: DatasetGroup[],
): DatasetNodeType[] {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 80, nodesep: 40 });

  const datasetToGroup = new Map<string, string>();
  for (const group of groups) {
    g.setNode(`cluster_${group.id}`, {});
    for (const ds of group.datasets) {
      datasetToGroup.set(ds, group.id);
    }
  }

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    const grpId = datasetToGroup.get(node.id);
    if (grpId) g.setParent(node.id, `cluster_${grpId}`);
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
      zIndex: 1,
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

  const groups = parseDatasetGroups(model.custom_extensions);
  const needsLayout = nodesWithSaved.some(
    (n) =>
      n.position.x === 0 &&
      n.position.y === 0 &&
      !parsePosition(model.datasets.find((d) => d.name === n.id)?.custom_extensions),
  );

  if (needsLayout) {
    return { nodes: autoLayout(nodesWithSaved, edges, groups), edges, didAutoLayout: true };
  }

  return { nodes: nodesWithSaved, edges, didAutoLayout: false };
}

function computeGroupBoxNodes(
  groups: DatasetGroup[],
  datasetNodes: DatasetNodeType[],
  onRename: (groupId: string, newName: string) => void,
  onContextMenu: (e: React.MouseEvent, groupId: string) => void,
): GroupBoxNodeType[] {
  const nodeMap = new Map(datasetNodes.map((n) => [n.id, n]));

  return groups
    .map((group, idx) => {
      const members = group.datasets
        .map((name) => nodeMap.get(name))
        .filter((n): n is DatasetNodeType => !!n);
      if (members.length === 0) return null;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const m of members) {
        minX = Math.min(minX, m.position.x);
        minY = Math.min(minY, m.position.y);
        maxX = Math.max(maxX, m.position.x + NODE_WIDTH);
        maxY = Math.max(maxY, m.position.y + NODE_HEIGHT);
      }

      const color = getGroupColor(group.color ?? GROUP_COLORS[idx % GROUP_COLORS.length].name);
      const w = maxX - minX + GROUP_PADDING * 2;
      const h = maxY - minY + GROUP_PADDING * 2 + GROUP_LABEL_HEIGHT;

      const node: GroupBoxNodeType = {
        id: `group-${group.id}`,
        type: "group-box" as const,
        position: { x: minX - GROUP_PADDING, y: minY - GROUP_PADDING - GROUP_LABEL_HEIGHT },
        selectable: false,
        draggable: true,
        connectable: false,
        focusable: false,
        deletable: false,
        zIndex: 0,
        width: w,
        height: h,
        data: {
          label: group.name,
          width: w,
          height: h,
          bgColor: color.bg as string,
          borderColor: color.border as string,
          groupId: group.id,
          onRename,
          onContextMenu,
        },
      };
      return node;
    })
    .filter((n): n is GroupBoxNodeType => n !== null);
}

function generateGroupId() {
  return `grp_${Math.random().toString(36).slice(2, 10)}`;
}

const VIEWPORT_STORAGE_PREFIX = "archmax:graph-viewport:";

function getSavedViewport(key: string): Viewport | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v.x === "number" && typeof v.y === "number" && typeof v.zoom === "number") {
      return v as Viewport;
    }
  } catch {
    // ignore malformed JSON
  }
  return null;
}

function ResetViewControl({ storageKey }: { storageKey: string }) {
  const { fitView } = useReactFlow();
  return (
    <button
      type="button"
      className="react-flow__controls-button"
      title="Reset view"
      onClick={() => {
        localStorage.removeItem(storageKey);
        fitView({ padding: 0.2 });
      }}
    >
      <Maximize2 />
    </button>
  );
}

interface ModelGraphViewProps {
  projectId: string;
  modelName: string;
  model: SemanticModelFull;
  diff: ModelDiff;
  className?: string;
  selectedDataset?: string | null;
  onSelectDataset?: (name: string | null) => void;
}

export function ModelGraphView({
  projectId,
  modelName,
  model,
  diff,
  className,
  selectedDataset = null,
  onSelectDataset,
}: ModelGraphViewProps) {
  const initial = useMemo(() => buildNodesAndEdges(model, diff), [model, diff]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);
  const hasSavedAutoLayout = useRef(false);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const groupDragRef = useRef<{
    startPos: { x: number; y: number };
    memberStarts: Map<string, { x: number; y: number }>;
  } | null>(null);

  const viewportKey = `${VIEWPORT_STORAGE_PREFIX}${projectId}:${modelName}`;
  const savedViewport = useMemo(() => {
    if (initial.didAutoLayout) return null;
    return getSavedViewport(viewportKey);
  }, [viewportKey, initial.didAutoLayout]);

  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      try {
        localStorage.setItem(viewportKey, JSON.stringify(viewport));
      } catch {
        // ignore quota errors
      }
    },
    [viewportKey],
  );

  const [groups, setGroups] = useState<DatasetGroup[]>(() =>
    parseDatasetGroups(model.custom_extensions),
  );
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const pendingDatasetRef = useRef<string | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const persistGroups = useCallback(
    (updated: DatasetGroup[]) => {
      const extensions = serializeDatasetGroups(updated, model.custom_extensions);
      api.api.projects[":projectId"]["semantic-models"][":name"].extensions.$patch({
        param: { projectId, name: modelName },
        json: { custom_extensions: extensions },
      }).catch(() => {});
    },
    [projectId, modelName, model.custom_extensions],
  );

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

  const handleNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type !== "group-box") return;
      const groupId = (node.data as GroupBoxNodeData).groupId;
      const group = groupsRef.current.find((g) => g.id === groupId);
      if (!group) return;

      const memberStarts = new Map<string, { x: number; y: number }>();
      for (const dsName of group.datasets) {
        const dsNode = nodesRef.current.find((n) => n.id === dsName);
        if (dsNode) memberStarts.set(dsName, { ...dsNode.position });
      }

      groupDragRef.current = { startPos: { ...node.position }, memberStarts };
    },
    [],
  );

  const handleNodeDrag = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const drag = groupDragRef.current;
      if (!drag || node.type !== "group-box") return;

      const dx = node.position.x - drag.startPos.x;
      const dy = node.position.y - drag.startPos.y;

      setNodes((prev) =>
        prev.map((n) => {
          const start = drag.memberStarts.get(n.id);
          if (!start) return n;
          return { ...n, position: { x: start.x + dx, y: start.y + dy } };
        }),
      );
    },
    [setNodes],
  );

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node, allNodes: Node[]) => {
      if (groupDragRef.current && node.type === "group-box") {
        const drag = groupDragRef.current;
        const dx = node.position.x - drag.startPos.x;
        const dy = node.position.y - drag.startPos.y;
        const moved = Array.from(drag.memberStarts, ([id, start]) => ({
          id,
          type: "dataset" as const,
          position: { x: start.x + dx, y: start.y + dy },
          data: {} as DatasetNodeData,
        })) as DatasetNodeType[];
        saveNodePositions(moved);
        groupDragRef.current = null;
      } else {
        saveNodePositions(allNodes.filter((n) => n.type === "dataset") as DatasetNodeType[]);
      }
    },
    [saveNodePositions],
  );

  const handleGroupRename = useCallback(
    (groupId: string, newName: string) => {
      setGroups((prev) => {
        const updated = prev.map((g) => (g.id === groupId ? { ...g, name: newName } : g));
        persistGroups(updated);
        return updated;
      });
    },
    [persistGroups],
  );

  const handleGroupContextMenu = useCallback((e: React.MouseEvent, groupId: string) => {
    setContextMenu({ x: e.clientX, y: e.clientY, groupId });
  }, []);

  const groupBoxNodes = useMemo(
    () => computeGroupBoxNodes(groups, nodes as DatasetNodeType[], handleGroupRename, handleGroupContextMenu),
    [groups, nodes, handleGroupRename, handleGroupContextMenu],
  );

  const allNodes = useMemo(
    () => [
      ...groupBoxNodes,
      ...nodes.map((n) => (n.selected === (n.id === selectedDataset) ? n : { ...n, selected: n.id === selectedDataset })),
    ] as Node[],
    [groupBoxNodes, nodes, selectedDataset],
  );

  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (node.type !== "dataset") return;
      onSelectDataset?.(node.id);
    },
    [onSelectDataset],
  );

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      if (node.type !== "dataset") return;
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, datasetName: node.id });
    },
    [],
  );

  const dismissMenu = useCallback(() => {
    setContextMenu(null);
    setCreatingGroup(false);
    setRenamingGroupId(null);
  }, []);

  const handlePaneClick = useCallback(() => {
    dismissMenu();
    onSelectDataset?.(null);
  }, [dismissMenu, onSelectDataset]);

  const findGroupForDataset = useCallback(
    (dsName: string) => groups.find((g) => g.datasets.includes(dsName)),
    [groups],
  );

  const handleCreateGroup = useCallback(
    (dsName: string) => {
      pendingDatasetRef.current = dsName;
      setNewGroupName("");
      setCreatingGroup(true);
      setContextMenu(null);
    },
    [],
  );

  const commitCreateGroup = useCallback(() => {
    const trimmed = newGroupName.trim();
    const dsName = pendingDatasetRef.current;
    if (!trimmed || !dsName) {
      setCreatingGroup(false);
      return;
    }
    setGroups((prev) => {
      const cleaned = prev.map((g) => ({
        ...g,
        datasets: g.datasets.filter((d) => d !== dsName),
      })).filter((g) => g.datasets.length > 0);

      const colorIdx = cleaned.length % GROUP_COLORS.length;
      const updated = [
        ...cleaned,
        { id: generateGroupId(), name: trimmed, datasets: [dsName], color: GROUP_COLORS[colorIdx].name },
      ];
      persistGroups(updated);
      return updated;
    });
    setCreatingGroup(false);
    pendingDatasetRef.current = null;
  }, [newGroupName, persistGroups]);

  const handleAddToGroup = useCallback(
    (dsName: string, groupId: string) => {
      setGroups((prev) => {
        const updated = prev.map((g) => {
          const withoutDs = g.datasets.filter((d) => d !== dsName);
          if (g.id === groupId) return { ...g, datasets: [...withoutDs, dsName] };
          return { ...g, datasets: withoutDs };
        }).filter((g) => g.datasets.length > 0);
        persistGroups(updated);
        return updated;
      });
      setContextMenu(null);
    },
    [persistGroups],
  );

  const handleRemoveFromGroup = useCallback(
    (dsName: string) => {
      setGroups((prev) => {
        const updated = prev
          .map((g) => ({ ...g, datasets: g.datasets.filter((d) => d !== dsName) }))
          .filter((g) => g.datasets.length > 0);
        persistGroups(updated);
        return updated;
      });
      setContextMenu(null);
    },
    [persistGroups],
  );

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      setGroups((prev) => {
        const updated = prev.filter((g) => g.id !== groupId);
        persistGroups(updated);
        return updated;
      });
      setContextMenu(null);
    },
    [persistGroups],
  );

  const handleRenameGroupFromMenu = useCallback(
    (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;
      setRenameValue(group.name);
      setRenamingGroupId(groupId);
      setContextMenu(null);
    },
    [groups, contextMenu],
  );

  const commitRenameGroup = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && renamingGroupId) {
      handleGroupRename(renamingGroupId, trimmed);
    }
    setRenamingGroupId(null);
  }, [renameValue, renamingGroupId, handleGroupRename]);

  return (
    <div className={cn("h-full relative", className)}>
      <ReactFlow
        nodes={allNodes}
        edges={edges}
        onNodesChange={onNodesChange as OnNodesChange<Node>}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onMoveEnd={handleMoveEnd}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        defaultViewport={savedViewport ?? undefined}
        fitView={!savedViewport}
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        snapToGrid
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={GRID_SIZE} size={1} />
        <Controls showInteractive={false} showFitView={false}>
          <ResetViewControl storageKey={viewportKey} />
        </Controls>
        <MiniMap
          nodeStrokeWidth={3}
          className="!bg-muted/50 !border-border rounded-lg"
        />
      </ReactFlow>

      {contextMenu && (
        <GraphContextMenu
          state={contextMenu}
          groups={groups}
          onCreateGroup={handleCreateGroup}
          onAddToGroup={handleAddToGroup}
          onRemoveFromGroup={handleRemoveFromGroup}
          onRenameGroup={handleRenameGroupFromMenu}
          onDeleteGroup={handleDeleteGroup}
          findGroupForDataset={findGroupForDataset}
        />
      )}

      {creatingGroup && (
        <CreateGroupPopover
          value={newGroupName}
          onChange={setNewGroupName}
          onCommit={commitCreateGroup}
          onCancel={() => setCreatingGroup(false)}
        />
      )}

      {renamingGroupId && (
        <RenameGroupPopover
          value={renameValue}
          onChange={setRenameValue}
          onCommit={commitRenameGroup}
          onCancel={() => setRenamingGroupId(null)}
        />
      )}
    </div>
  );
}
