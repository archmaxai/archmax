import { memo, useState, useRef, useCallback, useEffect } from "react";
import { type NodeProps, type Node } from "@xyflow/react";

export interface GroupBoxNodeData {
  label: string;
  width: number;
  height: number;
  bgColor: string;
  borderColor: string;
  groupId: string;
  onRename?: (groupId: string, newName: string) => void;
  onContextMenu?: (e: React.MouseEvent, groupId: string) => void;
  [key: string]: unknown;
}

export type GroupBoxNodeType = Node<GroupBoxNodeData, "group-box">;

export const GroupBoxNode = memo(function GroupBoxNode({
  data,
}: NodeProps<GroupBoxNodeType>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== data.label) {
      data.onRename?.(data.groupId, trimmed);
    } else {
      setDraft(data.label);
    }
  }, [draft, data]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      data.onContextMenu?.(e, data.groupId);
    },
    [data],
  );

  return (
    <div
      onContextMenu={handleContextMenu}
      style={{
        width: data.width,
        height: data.height,
        backgroundColor: data.bgColor,
        borderColor: data.borderColor,
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: 12,
        pointerEvents: "all",
      }}
      className="relative cursor-grab active:cursor-grabbing"
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setDraft(data.label);
              setEditing(false);
            }
          }}
          className="absolute top-2 left-3 bg-transparent text-xs font-medium outline-none border-b border-current w-32"
          style={{ color: data.borderColor }}
        />
      ) : (
        <span
          onDoubleClick={() => {
            setDraft(data.label);
            setEditing(true);
          }}
          className="absolute top-2 left-3 text-xs font-medium select-none cursor-default"
          style={{ color: data.borderColor }}
        >
          {data.label}
        </span>
      )}
    </div>
  );
});
