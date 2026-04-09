import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Columns3 } from "lucide-react";
import { cn } from "@archmax/ui";

export interface FieldPreview {
  name: string;
  dataType: string | null;
}

export interface DatasetNodeData {
  label: string;
  source: string;
  fieldCount: number;
  description?: string;
  fieldPreviews: FieldPreview[];
  highlighted?: boolean;
  [key: string]: unknown;
}

export type DatasetNodeType = Node<DatasetNodeData, "dataset">;

export const DatasetNode = memo(function DatasetNode({
  data,
  selected,
}: NodeProps<DatasetNodeType>) {
  const remaining = data.fieldCount - data.fieldPreviews.length;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-3.5 py-3 shadow-sm transition-all w-[260px]",
        selected && "ring-2 ring-ring",
        data.highlighted && "ring-2 ring-emerald-500/60 bg-emerald-500/5",
      )}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-muted-foreground/50 !border-none" />

      <div className="flex items-center gap-2">
        <Columns3 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-sm truncate">{data.label}</span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums shrink-0">
          {data.fieldCount}
        </span>
      </div>

      {data.description && (
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground line-clamp-2">
          {data.description}
        </p>
      )}

      {data.fieldPreviews.length > 0 && (
        <div className="mt-2 border-t pt-1.5 space-y-px">
          {data.fieldPreviews.map((f) => (
            <div key={f.name} className="flex items-baseline gap-1.5 text-[10px] leading-relaxed">
              <span className="font-mono truncate">{f.name}</span>
              {f.dataType && (
                <span className="ml-auto shrink-0 text-muted-foreground/70 font-mono uppercase text-[9px]">
                  {f.dataType}
                </span>
              )}
            </div>
          ))}
          {remaining > 0 && (
            <div className="text-[9px] text-muted-foreground/50 pt-0.5">
              +{remaining} more
            </div>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-muted-foreground/50 !border-none" />
    </div>
  );
});
