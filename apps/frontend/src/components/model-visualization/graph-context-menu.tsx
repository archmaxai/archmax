import { useRef, useEffect } from "react";
import { ChevronRightIcon, Plus, FolderPlus, FolderMinus, Pencil, Trash2 } from "lucide-react";
import type { DatasetGroup } from "./types";
import { getGroupColor } from "./types";

const MENU_CONTENT =
  "fixed z-50 min-w-[8rem] rounded-xl bg-popover text-popover-foreground p-1 shadow-popup animate-in fade-in-0 zoom-in-95";

const MENU_ITEM =
  "flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-foreground/[0.05] [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

interface ContextMenuState {
  x: number;
  y: number;
  datasetName?: string;
  groupId?: string;
}

export type { ContextMenuState };

interface GraphContextMenuProps {
  state: ContextMenuState;
  groups: DatasetGroup[];
  onCreateGroup: (datasetName: string) => void;
  onAddToGroup: (datasetName: string, groupId: string) => void;
  onRemoveFromGroup: (datasetName: string) => void;
  onRenameGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  findGroupForDataset: (datasetName: string) => DatasetGroup | undefined;
}

export function GraphContextMenu({
  state,
  groups,
  onCreateGroup,
  onAddToGroup,
  onRemoveFromGroup,
  onRenameGroup,
  onDeleteGroup,
  findGroupForDataset,
}: GraphContextMenuProps) {
  return (
    <div
      className={MENU_CONTENT}
      style={{ left: state.x, top: state.y, minWidth: 180 }}
    >
      {state.datasetName && (
        <>
          <button className={MENU_ITEM} onClick={() => onCreateGroup(state.datasetName!)}>
            <FolderPlus />
            Create group
          </button>

          {groups.length > 0 && (
            <div className="relative group/sub">
              <div className={MENU_ITEM}>
                <Plus />
                <span className="flex-1">Add to group</span>
                <ChevronRightIcon className="ml-auto size-4" />
              </div>
              <div
                className="invisible group-hover/sub:visible absolute left-full top-0 ml-0.5 min-w-[8rem] rounded-xl bg-popover text-popover-foreground p-1 shadow-popup"
                style={{ minWidth: 140 }}
              >
                {groups.map((g) => (
                  <button
                    key={g.id}
                    className={MENU_ITEM}
                    onClick={() => onAddToGroup(state.datasetName!, g.id)}
                  >
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: getGroupColor(g.color).border }}
                    />
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {findGroupForDataset(state.datasetName) && (
            <button className={MENU_ITEM} onClick={() => onRemoveFromGroup(state.datasetName!)}>
              <FolderMinus />
              Remove from group
            </button>
          )}
        </>
      )}

      {state.groupId && (
        <>
          <button className={MENU_ITEM} onClick={() => onRenameGroup(state.groupId!)}>
            <Pencil />
            Rename group
          </button>
          <button
            className={`${MENU_ITEM} text-destructive [&_svg]:!text-destructive`}
            onClick={() => onDeleteGroup(state.groupId!)}
          >
            <Trash2 />
            Delete group
          </button>
        </>
      )}
    </div>
  );
}

interface GroupNamePopoverProps {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  label: string;
  placeholder?: string;
  commitLabel: string;
}

function GroupNamePopover({
  value,
  onChange,
  onCommit,
  onCancel,
  label,
  placeholder,
  commitLabel,
}: GroupNamePopoverProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" onClick={onCancel}>
      <div
        className="z-50 rounded-xl bg-popover text-popover-foreground p-3 shadow-popup"
        onClick={(e) => e.stopPropagation()}
      >
        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommit();
              if (e.key === "Escape") onCancel();
            }}
            placeholder={placeholder}
            className="h-8 w-40 rounded-full border border-input bg-card px-3 text-sm outline-none transition-[color,box-shadow] focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
          />
          <button
            onClick={onCommit}
            className="h-8 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            {commitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CreateGroupPopover(props: Omit<GroupNamePopoverProps, "label" | "commitLabel" | "placeholder"> & { placeholder?: string }) {
  return <GroupNamePopover label="Group name" placeholder={props.placeholder ?? "e.g. Sales"} commitLabel="Create" {...props} />;
}

export function RenameGroupPopover(props: Omit<GroupNamePopoverProps, "label" | "commitLabel" | "placeholder">) {
  return <GroupNamePopover label="Rename group" placeholder="Group name" commitLabel="Rename" {...props} />;
}
