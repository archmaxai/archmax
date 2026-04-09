import { useState } from "react";
import {
  ChevronRight,
  Database,
  Columns3,
  BarChart3,
  GitBranch,
  Hash,
  Type,
} from "lucide-react";
import { cn, ScrollArea, Popover, PopoverTrigger, PopoverContent } from "@archmax/ui";
import type { SemanticModelFull, ModelDiff, FieldFull, MetricFull, RelationshipFull } from "./types";
import { getExpressionString, getRelationshipColumns, getFieldDataType } from "./types";

function parseCommonExtension(field: FieldFull): { data_type?: string; example_data?: string[]; distinct_values?: string[] } {
  const ext = field.custom_extensions?.find((e) => e.vendor_name === "COMMON");
  if (!ext) return {};
  try {
    return JSON.parse(ext.data);
  } catch {
    return {};
  }
}

interface TreeItemProps {
  icon: React.ElementType;
  label: string;
  sublabel?: string;
  children?: React.ReactNode;
  depth?: number;
  defaultOpen?: boolean;
  highlighted?: boolean;
  detail?: React.ReactNode;
}

function TreeItem({
  icon: Icon,
  label,
  sublabel,
  children,
  depth = 0,
  defaultOpen = false,
  highlighted,
  detail,
}: TreeItemProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = !!children;

  const button = (
    <button
      onClick={() => hasChildren && setOpen(!open)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-all",
        hasChildren ? "hover:bg-foreground/[0.05] cursor-pointer" : "cursor-default",
        highlighted && "bg-emerald-500/10 ring-1 ring-emerald-500/30 animate-in fade-in duration-300",
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      {hasChildren ? (
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-foreground/80">{label}</span>
      {sublabel && (
        <span className="ml-1 truncate text-muted-foreground/60 text-[10px]">
          {sublabel}
        </span>
      )}
    </button>
  );

  return (
    <div>
      {detail ? (
        <Popover>
          <PopoverTrigger asChild>{button}</PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-80 text-xs p-3">
            {detail}
          </PopoverContent>
        </Popover>
      ) : (
        button
      )}
      {open && children}
    </div>
  );
}

function FieldDetail({ field }: { field: FieldFull }) {
  const expr = getExpressionString(field.expression);
  const ext = parseCommonExtension(field);
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-foreground">{field.name}</p>
      {field.description && <p className="text-muted-foreground">{field.description}</p>}
      {expr && (
        <div>
          <span className="text-muted-foreground">Expression: </span>
          <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">{expr}</code>
        </div>
      )}
      {ext.data_type && (
        <div>
          <span className="text-muted-foreground">Type: </span>
          <span>{ext.data_type}</span>
        </div>
      )}
      {ext.example_data && ext.example_data.length > 0 && (
        <div>
          <span className="text-muted-foreground">Examples: </span>
          <span>{ext.example_data.join(", ")}</span>
        </div>
      )}
      {ext.distinct_values && ext.distinct_values.length > 0 && (
        <div>
          <span className="text-muted-foreground">Values: </span>
          <span>{ext.distinct_values.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

function MetricDetail({ metric }: { metric: MetricFull }) {
  const expr = getExpressionString(metric.expression);
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-foreground">{metric.name}</p>
      {metric.description && <p className="text-muted-foreground">{metric.description}</p>}
      {expr && (
        <div>
          <span className="text-muted-foreground">Expression: </span>
          <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">{expr}</code>
        </div>
      )}
    </div>
  );
}

function RelationshipDetail({ rel }: { rel: RelationshipFull }) {
  const cols = getRelationshipColumns(rel);
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-foreground">{rel.name}</p>
      <div>
        <span className="text-muted-foreground">From: </span>
        <span>{rel.from}</span>
        <span className="text-muted-foreground"> ({cols.from.join(", ")})</span>
      </div>
      <div>
        <span className="text-muted-foreground">To: </span>
        <span>{rel.to}</span>
        <span className="text-muted-foreground"> ({cols.to.join(", ")})</span>
      </div>
    </div>
  );
}

function fieldIcon(dataType?: string) {
  return dataType?.match(/int|float|decimal|numeric|double|bigint/i) ? Hash : Type;
}

interface ModelTreeViewProps {
  model: SemanticModelFull;
  diff: ModelDiff;
  className?: string;
}

export function ModelTreeView({ model, diff, className }: ModelTreeViewProps) {
  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="p-2">
        <TreeItem icon={Database} label={model.name} depth={0} defaultOpen>
          {model.datasets.length > 0 && (
            <TreeItem
              icon={Columns3}
              label="Datasets"
              sublabel={`${model.datasets.length}`}
              depth={1}
              defaultOpen
            >
              {model.datasets.map((ds) => (
                <TreeItem
                  key={ds.name}
                  icon={Columns3}
                  label={ds.name}
                  sublabel={ds.source}
                  depth={2}
                  defaultOpen={false}
                  highlighted={diff.addedDatasets.has(ds.name) || diff.modifiedDatasets.has(ds.name)}
                >
                  {ds.fields.map((f) => {
                    const dt = getFieldDataType(f);
                    return (
                      <TreeItem
                        key={f.name}
                        icon={fieldIcon(dt ?? undefined)}
                        label={f.name}
                        sublabel={dt ?? undefined}
                        depth={3}
                        highlighted={diff.modifiedFields.get(ds.name)?.has(f.name)}
                        detail={<FieldDetail field={f} />}
                      />
                    );
                  })}
                </TreeItem>
              ))}
            </TreeItem>
          )}

          {model.metrics.length > 0 && (
            <TreeItem
              icon={BarChart3}
              label="Metrics"
              sublabel={`${model.metrics.length}`}
              depth={1}
              defaultOpen={false}
            >
              {model.metrics.map((m) => (
                <TreeItem
                  key={m.name}
                  icon={BarChart3}
                  label={m.name}
                  sublabel={getExpressionString(m.expression)}
                  depth={2}
                  highlighted={diff.addedMetrics.has(m.name) || diff.modifiedMetrics.has(m.name)}
                  detail={<MetricDetail metric={m} />}
                />
              ))}
            </TreeItem>
          )}

          {model.relationships.length > 0 && (
            <TreeItem
              icon={GitBranch}
              label="Relationships"
              sublabel={`${model.relationships.length}`}
              depth={1}
              defaultOpen={false}
            >
              {model.relationships.map((r) => (
                <TreeItem
                  key={r.name}
                  icon={GitBranch}
                  label={r.name}
                  sublabel={`${r.from} → ${r.to}`}
                  depth={2}
                  highlighted={diff.addedRelationships.has(r.name)}
                  detail={<RelationshipDetail rel={r} />}
                />
              ))}
            </TreeItem>
          )}
        </TreeItem>
      </div>
    </ScrollArea>
  );
}
