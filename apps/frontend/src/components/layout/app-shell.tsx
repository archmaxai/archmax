import { useState, useCallback, type ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import type { Project } from "@/lib/project-context";

export function AppShell({
  project,
  children,
}: {
  project: Project | null;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("archsem-sidebar-collapsed") === "true";
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("archsem-sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  return (
    <div className="flex h-full min-h-0">
      <AppSidebar project={project} collapsed={collapsed} onToggle={toggle} />
      <main className="flex-1 min-h-0 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
