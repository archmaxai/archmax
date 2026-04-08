import {
  ArrowRightLeft,
  Copy,
  Database,
  FolderOpen,
  FileText,
  FileOutput,
  Pencil,
  Search,
  Trash2,
  BookOpen,
  Wrench,
  ListTodo,
  Bot,
} from "lucide-react";
import type { ToolCallInfo } from "../../lib/chat-types";
import { safeParse, getArgs, fileBasename } from "./tool-call-helpers";

function countTodos(tc: ToolCallInfo): { total: number; done: number } | null {
  const sources: Record<string, unknown>[] = [];

  const args = getArgs(tc);
  if (args) sources.push(args);
  if (args?.update && typeof args.update === "object")
    sources.push(args.update as Record<string, unknown>);

  if (tc.result) {
    const r = safeParse(tc.result) as Record<string, unknown> | null;
    if (r) {
      sources.push(r);
      if (r.update && typeof r.update === "object")
        sources.push(r.update as Record<string, unknown>);
    }
  }

  for (const src of sources) {
    if (Array.isArray(src.todos) && src.todos.length > 0) {
      const todos = src.todos as Array<{
        status?: string;
        completed?: boolean;
      }>;
      const done = todos.filter(
        (t) => t.status === "completed" || t.completed === true,
      ).length;
      return { total: todos.length, done };
    }
  }
  return null;
}

export const TOOL_META: Record<
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
  mv: {
    icon: ArrowRightLeft,
    label: (tc) => {
      const a = getArgs(tc);
      const from = ((a?.oldPath as string) || "").split("/").pop() || "file";
      const to = ((a?.newPath as string) || "").split("/").pop() || "file";
      return tc.status === "completed"
        ? `Moved ${from} → ${to}`
        : `Moving ${from}…`;
    },
  },
  cp: {
    icon: Copy,
    label: (tc) => {
      const a = getArgs(tc);
      const from = ((a?.srcPath as string) || "").split("/").pop() || "file";
      const to = ((a?.destPath as string) || "").split("/").pop() || "file";
      return tc.status === "completed"
        ? `Copied ${from} → ${to}`
        : `Copying ${from}…`;
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
    label: (tc) => {
      const counts = countTodos(tc);
      if (counts) {
        return `Updated plan · ${counts.done}/${counts.total} done`;
      }
      return "Updated plan";
    },
  },
};

export function getToolMeta(name: string) {
  return TOOL_META[name] ?? { icon: Wrench, label: () => name };
}
