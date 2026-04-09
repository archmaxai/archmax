import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@archmax/ui";

export function AccordionSection({
  title,
  defaultOpen = true,
  action,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col min-h-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:bg-foreground/[0.03] transition-colors w-full text-left"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="flex-1">{title}</span>
        {action && (
          <span onClick={(e) => e.stopPropagation()}>{action}</span>
        )}
      </button>
      {open && (
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      )}
    </div>
  );
}
