import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn, ScrollArea } from "@archmax/ui";
import { api } from "@/lib/api";

interface YamlBlock {
  headerLine: number;
  key: string;
  indent: number;
  startLine: number;
  endLine: number;
}

function detectBlocks(lines: string[]): YamlBlock[] {
  const blocks: YamlBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#") || line === "---") continue;

    const indent = line.length - trimmed.length;
    const isKey = trimmed.includes(":") && !trimmed.startsWith("- ");
    const isListKey = trimmed.startsWith("- ") && trimmed.slice(2).includes(":");
    if (!isKey && !isListKey) continue;

    const colonIdx = isListKey
      ? trimmed.indexOf(":", 2)
      : trimmed.indexOf(":");
    const afterColon = trimmed.slice(colonIdx + 1).trim();
    if (afterColon && afterColon !== ">" && afterColon !== "|") continue;

    let childCount = 0;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (!next.trim() || next.trim().startsWith("#")) {
        end = j;
        continue;
      }
      const nextIndent = next.length - next.trimStart().length;
      if (nextIndent <= indent) break;
      childCount++;
      end = j;
    }

    if (childCount >= 2) {
      const key = isListKey
        ? trimmed.slice(2, colonIdx).trim()
        : trimmed.slice(0, colonIdx).trim();
      blocks.push({ headerLine: i, key, indent, startLine: i + 1, endLine: end });
    }
  }

  return blocks;
}

function renderValue(value: string): React.ReactNode {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed === ">" || trimmed === "|") {
    return <span className="text-muted-foreground">{value}</span>;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return <span className="text-emerald-600 dark:text-emerald-400">{value}</span>;
  }
  if (trimmed === "true" || trimmed === "false" || trimmed === "null") {
    return <span className="text-violet-600 dark:text-violet-400">{value}</span>;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return <span className="text-amber-600 dark:text-amber-400">{value}</span>;
  }
  return <span>{value}</span>;
}

function highlightLine(line: string, lineIdx: number): React.ReactNode {
  if (line.startsWith("#")) {
    return (
      <span className="text-muted-foreground italic">{line}</span>
    );
  }

  if (line.trimStart().startsWith("- ")) {
    const indent = line.length - line.trimStart().length;
    const rest = line.trimStart().slice(2);
    const colonIdx = rest.indexOf(":");
    if (colonIdx > 0 && !rest.startsWith('"') && !rest.startsWith("'")) {
      const key = rest.slice(0, colonIdx);
      const value = rest.slice(colonIdx + 1);
      return (
        <>
          {" ".repeat(indent)}
          <span className="text-muted-foreground">{"- "}</span>
          <span className="text-chart-1">{key}</span>
          <span className="text-muted-foreground">:</span>
          {renderValue(value)}
        </>
      );
    }
    return (
      <>
        {" ".repeat(indent)}
        <span className="text-muted-foreground">{"- "}</span>
        {renderValue(rest)}
      </>
    );
  }

  if (line.includes(":") && !line.trimStart().startsWith("-")) {
    const colonIdx = line.indexOf(":");
    const key = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    return (
      <>
        <span className="text-chart-1">{key}</span>
        <span className="text-muted-foreground">:</span>
        {renderValue(value)}
      </>
    );
  }

  if (line === "---") {
    return <span className="text-muted-foreground">{line}</span>;
  }

  return <>{line}</>;
}

function CollapsibleYaml({ yamlContent }: { yamlContent: string }) {
  const lines = useMemo(() => yamlContent.split("\n"), [yamlContent]);
  const blocks = useMemo(() => detectBlocks(lines), [lines]);
  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set(blocks.map((b) => b.headerLine)),
  );

  const toggle = useCallback((headerLine: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(headerLine)) next.delete(headerLine);
      else next.add(headerLine);
      return next;
    });
  }, []);

  const blockByHeader = useMemo(() => {
    const map = new Map<number, YamlBlock>();
    for (const b of blocks) map.set(b.headerLine, b);
    return map;
  }, [blocks]);

  const hiddenLines = useMemo(() => {
    const hidden = new Set<number>();
    for (const hl of collapsed) {
      const block = blockByHeader.get(hl);
      if (!block) continue;
      for (let i = block.startLine; i <= block.endLine; i++) {
        hidden.add(i);
      }
    }
    return hidden;
  }, [collapsed, blockByHeader]);

  const renderedLines: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (hiddenLines.has(i)) continue;

    const block = blockByHeader.get(i);
    const isCollapsed = collapsed.has(i);
    const childCount = block ? block.endLine - block.startLine + 1 : 0;

    renderedLines.push(
      <div key={i} className="flex">
        <span className="w-5 shrink-0 flex items-center justify-center">
          {block ? (
            <button
              onClick={() => toggle(i)}
              className="flex items-center justify-center h-4 w-4 rounded hover:bg-foreground/[0.06] transition-colors"
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 text-muted-foreground/50 transition-transform",
                  !isCollapsed && "rotate-90",
                )}
              />
            </button>
          ) : null}
        </span>
        <span className="flex-1">
          {highlightLine(lines[i], i)}
          {isCollapsed && (
            <button
              onClick={() => toggle(i)}
              className="ml-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 transition-colors"
            >
              {childCount} lines
            </button>
          )}
        </span>
      </div>,
    );
  }

  return <>{renderedLines}</>;
}

interface ModelYamlViewProps {
  projectId: string;
  modelName: string;
  className?: string;
}

export function ModelYamlView({ projectId, modelName, className }: ModelYamlViewProps) {
  const { data: yamlContent, isLoading } = useQuery({
    queryKey: ["semantic-model-yaml", projectId, modelName],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["semantic-models"][":name"].yaml.$get({
        param: { projectId, name: modelName },
      });
      if (!res.ok) throw new Error("Failed to fetch YAML");
      return res.text();
    },
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-16", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!yamlContent) {
    return (
      <div className={cn("flex items-center justify-center py-16 text-sm text-muted-foreground", className)}>
        No YAML content available
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      <pre className="p-4 pl-1 text-xs leading-relaxed font-mono whitespace-pre overflow-x-auto">
        <code>
          <CollapsibleYaml yamlContent={yamlContent} />
        </code>
      </pre>
    </ScrollArea>
  );
}
