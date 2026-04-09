import { useState, useRef, useLayoutEffect } from "react";
import {
  Loader2,
  Check,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@archmax/ui";
import type { ToolCallInfo } from "../../lib/chat-types";
import { getToolMeta } from "./tool-metadata";
import { ExpandedContent } from "./tool-expanded";

function StatusIcon({ status }: { status: ToolCallInfo["status"] }) {
  if (status === "running")
    return (
      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
    );
  if (status === "completed")
    return <Check className="h-3 w-3 text-emerald-500" />;
  return <AlertCircle className="h-3 w-3 text-destructive" />;
}

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
