import { useState, useRef, useLayoutEffect } from "react";
import {
  ArrowRightLeft,
  Database,
  FolderOpen,
  FileText,
  FileOutput,
  Pencil,
  Search,
  Trash2,
  BookOpen,
  Wrench,
  Loader2,
  Check,
  AlertCircle,
  ChevronRight,
  ListTodo,
  Bot,
} from "lucide-react";
import { cn } from "@semlayer/ui";
import type { ToolCallInfo } from "../../lib/chat-types";
import { MarkdownContent } from "./markdown-components";

// ── Helpers ──────────────────────────────────────────────────────────

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Parse tool call args, handling deepagents' `{input: <args>}` wrapping
 * and double-encoded strings like `{input: '{"sql":"..."}'}`.
 */
function getArgs(tc: ToolCallInfo): Record<string, unknown> {
  const parsed = safeParse(tc.args) as Record<string, unknown> | null;
  if (!parsed) return {};

  if ("input" in parsed && Object.keys(parsed).length === 1) {
    const inner = parsed.input;
    if (typeof inner === "string") {
      const innerParsed = safeParse(inner);
      if (
        innerParsed &&
        typeof innerParsed === "object" &&
        !Array.isArray(innerParsed)
      ) {
        return innerParsed as Record<string, unknown>;
      }
      return { input: inner };
    }
    if (typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
  }

  return parsed;
}

function fileBasename(tc: ToolCallInfo): string {
  const args = getArgs(tc);
  const file =
    (args?.file_path as string) || (args?.path as string) || "file";
  return file.split("/").pop() || file;
}

// ── Status indicator ─────────────────────────────────────────────────

function StatusIcon({ status }: { status: ToolCallInfo["status"] }) {
  if (status === "running")
    return (
      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
    );
  if (status === "completed")
    return <Check className="h-3 w-3 text-emerald-500" />;
  return <AlertCircle className="h-3 w-3 text-destructive" />;
}

// ── Tool metadata ────────────────────────────────────────────────────

const TOOL_META: Record<
  string,
  { icon: React.ElementType; label: (tc: ToolCallInfo) => string }
> = {
  executeQuery: {
    icon: Database,
    label: (tc) => {
      if (tc.status === "completed" && tc.result) {
        const r = safeParse(tc.result) as Record<string, unknown> | null;
        if (r?.rowCount != null)
          return `Queried database · ${r.rowCount} rows`;
      }
      return "Querying database…";
    },
  },
  ls: {
    icon: FolderOpen,
    label: (tc) => {
      const a = getArgs(tc);
      const p = (a?.path as string) || ".";
      return tc.status === "completed" ? `Listed ${p}` : `Listing ${p}…`;
    },
  },
  read_file: {
    icon: FileText,
    label: (tc) => {
      const n = fileBasename(tc);
      return tc.status === "completed" ? `Read ${n}` : `Reading ${n}…`;
    },
  },
  write_file: {
    icon: FileOutput,
    label: (tc) => {
      const n = fileBasename(tc);
      return tc.status === "completed" ? `Wrote ${n}` : `Writing ${n}…`;
    },
  },
  edit_file: {
    icon: Pencil,
    label: (tc) => {
      const n = fileBasename(tc);
      return tc.status === "completed" ? `Edited ${n}` : `Editing ${n}…`;
    },
  },
  find: {
    icon: Search,
    label: (tc) =>
      tc.status === "completed" ? "Searched files" : "Searching files…",
  },
  rm: {
    icon: Trash2,
    label: (tc) => {
      const n = fileBasename(tc);
      return tc.status === "completed" ? `Deleted ${n}` : `Deleting ${n}…`;
    },
  },
  rename: {
    icon: ArrowRightLeft,
    label: (tc) => {
      const a = getArgs(tc);
      const from = ((a?.oldPath as string) || "").split("/").pop() || "file";
      const to = ((a?.newPath as string) || "").split("/").pop() || "file";
      return tc.status === "completed"
        ? `Renamed ${from} → ${to}`
        : `Renaming ${from}…`;
    },
  },
  read_document: {
    icon: BookOpen,
    label: (tc) => {
      const a = getArgs(tc);
      const name = a?.filename as string;
      if (!name)
        return tc.status === "completed"
          ? "Listed documents"
          : "Listing documents…";
      return tc.status === "completed" ? `Read ${name}` : `Reading ${name}…`;
    },
  },
  task: {
    icon: Bot,
    label: (tc) =>
      tc.status === "completed"
        ? "Sub-agent finished"
        : "Starting sub-agent…",
  },
  write_todos: {
    icon: ListTodo,
    label: () => "Updated plan",
  },
};

function getToolMeta(name: string) {
  return TOOL_META[name] ?? { icon: Wrench, label: () => name };
}

// ── Shared layout pieces ─────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function MonoPre({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-md bg-muted/50 p-2.5 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all",
        className,
      )}
    >
      {children}
    </pre>
  );
}

// ── Per-tool expanded content ────────────────────────────────────────

function ExecuteQueryExpanded({ tc }: { tc: ToolCallInfo }) {
  const args = getArgs(tc);
  const result = tc.result
    ? (safeParse(tc.result) as Record<string, unknown> | null)
    : null;
  const sql = (args?.sql as string) ?? tc.args;
  const columns = (result?.columns ?? []) as string[];
  const rows = (result?.rows ?? []) as Record<string, unknown>[];
  const truncated = result?.truncated as boolean | undefined;
  const error = result?.error as string | undefined;

  return (
    <div className="space-y-3">
      <Section label="Query">
        <MonoPre>{sql}</MonoPre>
      </Section>

      {error && (
        <Section label="Error">
          <p className="text-[11px] text-destructive">{error}</p>
        </Section>
      )}

      {columns.length > 0 && (
        <Section
          label={`Results${result?.rowCount != null ? ` · ${result.rowCount} rows` : ""}`}
        >
          <div className="overflow-x-auto rounded-md border border-border/40">
            <table className="min-w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-2 py-1 text-left font-medium whitespace-nowrap text-muted-foreground"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-border/20 last:border-0"
                  >
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="max-w-48 truncate whitespace-nowrap px-2 py-1"
                      >
                        {String(row[col] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {(rows.length > 20 || truncated) && (
              <div className="border-t border-border/40 bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
                {truncated
                  ? "Results truncated"
                  : `Showing 20 of ${rows.length} rows`}
              </div>
            )}
          </div>
        </Section>
      )}

      {!error && columns.length === 0 && tc.result && (
        <Section label="Result">
          <SmartResult result={tc.result} />
        </Section>
      )}
    </div>
  );
}

function WriteTodosExpanded({ tc }: { tc: ToolCallInfo }) {
  const args = getArgs(tc);
  const todos = (args?.todos ?? []) as Array<{
    id?: string;
    content?: string;
    title?: string;
    status?: string;
    completed?: boolean;
  }>;

  if (!todos.length) return <GenericExpanded tc={tc} />;

  return (
    <ul className="space-y-1.5 py-0.5">
      {todos.map((t, i) => {
        const done = t.status === "completed" || t.completed === true;
        const inProgress = t.status === "in_progress";
        const text = t.content || t.title || JSON.stringify(t);
        return (
          <li key={t.id ?? i} className="flex items-start gap-2 text-[11px]">
            <span
              className={cn(
                "mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                done && "border-emerald-500/50 bg-emerald-500/10 text-emerald-500",
                inProgress && "border-blue-500/50 bg-blue-500/10 text-blue-500",
                !done && !inProgress && "border-border",
              )}
            >
              {done && <Check className="h-2.5 w-2.5" />}
              {inProgress && (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              )}
            </span>
            <span
              className={cn(
                done && "text-muted-foreground line-through",
                inProgress && "font-medium",
              )}
            >
              {text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TaskExpanded({ tc }: { tc: ToolCallInfo }) {
  const args = getArgs(tc);
  const description = (args?.description as string) ?? "";

  return (
    <div className="space-y-3">
      {description && (
        <Section label="Prompt">
          <MarkdownContent
            content={description}
            className="text-[11px] prose-p:text-[11px] prose-li:text-[11px]"
          />
        </Section>
      )}
      {tc.result && (
        <Section label="Output">
          <MarkdownContent
            content={tc.result}
            className="text-[11px] prose-p:text-[11px] prose-li:text-[11px]"
          />
        </Section>
      )}
    </div>
  );
}

function FileListExpanded({ tc }: { tc: ToolCallInfo }) {
  if (!tc.result) return null;
  const raw = (safeParse(tc.result) as string | null) ?? tc.result;
  const text = typeof raw === "string" ? raw : String(raw);
  const lines = text.split("\n").filter(Boolean);

  return (
    <Section label="Files">
      <div className="space-y-0.5">
        {lines.slice(0, 30).map((line, i) => {
          const isDir =
            line.endsWith("/") || line.includes("(directory)");
          return (
            <div
              key={i}
              className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground"
            >
              {isDir ? (
                <FolderOpen className="h-3 w-3 shrink-0 opacity-50" />
              ) : (
                <FileText className="h-3 w-3 shrink-0 opacity-50" />
              )}
              <span className="truncate">{line}</span>
            </div>
          );
        })}
        {lines.length > 30 && (
          <span className="text-[10px] text-muted-foreground">
            …and {lines.length - 30} more
          </span>
        )}
      </div>
    </Section>
  );
}

function FileContentExpanded({ tc }: { tc: ToolCallInfo }) {
  if (!tc.result) return null;
  const lines = tc.result.split("\n");
  const preview = lines.slice(0, 25).join("\n");

  return (
    <Section label="Content">
      <MonoPre className="max-h-64 overflow-y-auto">{preview}</MonoPre>
      {lines.length > 25 && (
        <span className="mt-1 block text-[10px] text-muted-foreground">
          …{lines.length - 25} more lines
        </span>
      )}
    </Section>
  );
}

function RenameExpanded({ tc }: { tc: ToolCallInfo }) {
  const args = getArgs(tc);
  const from = (args?.oldPath as string) || "?";
  const to = (args?.newPath as string) || "?";
  const result = tc.result
    ? (safeParse(tc.result) as Record<string, unknown> | null)
    : null;
  const error = result?.error as string | undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-mono">
        <span className="text-muted-foreground">{from}</span>
        <ArrowRightLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span>{to}</span>
      </div>
      {error && (
        <Section label="Error">
          <p className="text-[11px] text-destructive">{error}</p>
        </Section>
      )}
    </div>
  );
}

function GenericExpanded({ tc }: { tc: ToolCallInfo }) {
  const args = getArgs(tc);
  const hasArgs = Object.keys(args).length > 0;

  return (
    <div className="space-y-3">
      {hasArgs && (
        <Section label="Input">
          <div className="space-y-1 text-[11px]">
            {Object.entries(args).map(([key, value]) => {
              const display =
                typeof value === "string"
                  ? value
                  : JSON.stringify(value, null, 2);
              const isLong = display.length > 120;
              return (
                <div key={key}>
                  <span className="text-muted-foreground">{key}:</span>{" "}
                  {isLong ? (
                    <MonoPre className="mt-0.5 max-h-32 overflow-y-auto">
                      {display}
                    </MonoPre>
                  ) : (
                    <span className="font-mono">{display}</span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {tc.result && (
        <Section label="Output">
          <SmartResult result={tc.result} />
        </Section>
      )}
    </div>
  );
}

function SmartResult({ result }: { result: string }) {
  const parsed = safeParse(result);

  if (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
  ) {
    const entries = Object.entries(parsed as Record<string, unknown>);
    const isFlat =
      entries.length <= 6 &&
      entries.every(([, v]) => typeof v !== "object" || v === null);

    if (isFlat) {
      return (
        <div className="space-y-0.5 text-[11px]">
          {entries.map(([k, v]) => (
            <div key={k}>
              <span className="text-muted-foreground">{k}:</span>{" "}
              <span className="font-mono">{String(v)}</span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <MonoPre className="max-h-48 overflow-y-auto">
        {JSON.stringify(parsed, null, 2)}
      </MonoPre>
    );
  }

  return (
    <MonoPre className="max-h-48 overflow-y-auto">{result}</MonoPre>
  );
}

// ── Content router ───────────────────────────────────────────────────

function ExpandedContent({ tc }: { tc: ToolCallInfo }) {
  switch (tc.name) {
    case "executeQuery":
      return <ExecuteQueryExpanded tc={tc} />;
    case "write_todos":
      return <WriteTodosExpanded tc={tc} />;
    case "task":
      return <TaskExpanded tc={tc} />;
    case "ls":
    case "find":
      return <FileListExpanded tc={tc} />;
    case "read_file":
    case "write_file":
    case "edit_file":
      return <FileContentExpanded tc={tc} />;
    case "rename":
      return <RenameExpanded tc={tc} />;
    default:
      return <GenericExpanded tc={tc} />;
  }
}

// ── Main card ────────────────────────────────────────────────────────

export function ToolCallCard({ tc }: { tc: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setContentHeight(entry.contentRect.height);
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  const meta = getToolMeta(tc.name);
  const Icon = meta.icon;
  const label = meta.label(tc);

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-border/40 bg-muted/20 text-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 transition-colors hover:bg-foreground/[0.03]"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-left text-muted-foreground">
          {label}
        </span>
        <StatusIcon status={tc.status} />
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90",
          )}
        />
      </button>
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight: expanded ? contentHeight + 32 : 0 }}
      >
        <div
          ref={contentRef}
          className="border-t border-border/40 px-3 py-2"
        >
          <ExpandedContent tc={tc} />
        </div>
      </div>
    </div>
  );
}
