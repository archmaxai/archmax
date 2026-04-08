import {
  FolderOpen,
  FileText,
  ArrowRightLeft,
  Copy,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@archsem/ui";
import type { ToolCallInfo } from "../../lib/chat-types";
import { MarkdownContent } from "./markdown-components";
import { safeParse, getArgs } from "./tool-call-helpers";

export function Section({
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

export function MonoPre({
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

export function SmartResult({ result }: { result: string }) {
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

type TodoItem = {
  id?: string;
  content?: string;
  title?: string;
  status?: string;
  completed?: boolean;
};

function extractTodos(tc: ToolCallInfo): TodoItem[] {
  const args = getArgs(tc);

  if (Array.isArray(args?.todos) && args.todos.length > 0)
    return args.todos as TodoItem[];

  const argsUpdate = args?.update as Record<string, unknown> | undefined;
  if (Array.isArray(argsUpdate?.todos) && argsUpdate.todos.length > 0)
    return argsUpdate.todos as TodoItem[];

  if (tc.result) {
    const result = safeParse(tc.result) as Record<string, unknown> | null;
    if (result) {
      if (Array.isArray(result.todos) && result.todos.length > 0)
        return result.todos as TodoItem[];

      const resUpdate = result.update as Record<string, unknown> | undefined;
      if (Array.isArray(resUpdate?.todos) && resUpdate.todos.length > 0)
        return resUpdate.todos as TodoItem[];
    }
  }

  return [];
}

function WriteTodosExpanded({ tc }: { tc: ToolCallInfo }) {
  const todos = extractTodos(tc);

  if (!todos.length) return <GenericExpanded tc={tc} />;

  const done = todos.filter(
    (t) => t.status === "completed" || t.completed === true,
  ).length;
  const total = todos.length;

  return (
    <div className="space-y-2.5 py-0.5">
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/50">
          <div
            className="h-full rounded-full bg-emerald-500/70 transition-all duration-300"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </div>
      <ul className="space-y-1.5">
        {todos.map((t, i) => {
          const isDone = t.status === "completed" || t.completed === true;
          const inProgress = t.status === "in_progress";
          const text = t.content || t.title || JSON.stringify(t);
          return (
            <li
              key={t.id ?? i}
              className="flex items-start gap-2 text-[11px]"
            >
              <span
                className={cn(
                  "mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                  isDone &&
                    "border-emerald-500/50 bg-emerald-500/10 text-emerald-500",
                  inProgress &&
                    "border-blue-500/50 bg-blue-500/10 text-blue-500",
                  !isDone && !inProgress && "border-border",
                )}
              >
                {isDone && <Check className="h-2.5 w-2.5" />}
                {inProgress && (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                )}
              </span>
              <span
                className={cn(
                  isDone && "text-muted-foreground line-through",
                  inProgress && "font-medium",
                )}
              >
                {text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
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

function MvExpanded({ tc }: { tc: ToolCallInfo }) {
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

function CpExpanded({ tc }: { tc: ToolCallInfo }) {
  const args = getArgs(tc);
  const from = (args?.srcPath as string) || "?";
  const to = (args?.destPath as string) || "?";
  const result = tc.result
    ? (safeParse(tc.result) as Record<string, unknown> | null)
    : null;
  const error = result?.error as string | undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-mono">
        <span className="text-muted-foreground">{from}</span>
        <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />
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

export function ExpandedContent({ tc }: { tc: ToolCallInfo }) {
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
    case "mv":
      return <MvExpanded tc={tc} />;
    case "cp":
      return <CpExpanded tc={tc} />;
    default:
      return <GenericExpanded tc={tc} />;
  }
}
