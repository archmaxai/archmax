import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Database,
  Sparkles,
  KeyRound,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  FlaskConical,
  House,
} from "lucide-react";
import {
  cn,
  ScrollArea,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@archmax/ui";
import { ProjectSelector } from "./project-selector";
import { UserMenu } from "./user-menu";
import type { Project } from "@/lib/project-context";

type NavChild = { label: string; path: string };
type NavItem =
  | { label: string; icon: typeof Database; path: string; children?: undefined }
  | { label: string; icon: typeof Database; path?: undefined; children: NavChild[] };

const navItems: NavItem[] = [
  { label: "Home", icon: House, path: "" },
  {
    label: "Data Federation",
    icon: Database,
    children: [
      { label: "Data Sources", path: "connections" },
      { label: "Browser", path: "connections/data" },
    ],
  },
  { label: "Semantic Models", icon: Sparkles, path: "models" },
  {
    label: "Testing",
    icon: FlaskConical,
    children: [
      { label: "Test Agents", path: "testing/agents" },
      { label: "Test Cases", path: "testing/cases" },
      { label: "Test Runs", path: "testing/runs" },
      { label: "Playground", path: "testing/playground" },
    ],
  },
  {
    label: "MCP Access",
    icon: KeyRound,
    children: [
      { label: "Tokens", path: "mcp-access" },
      { label: "Log", path: "monitoring" },
    ],
  },
  { label: "Settings", icon: Settings, path: "settings" },
];

export function AppSidebar({
  project,
  collapsed,
  onToggle,
}: {
  project: Project | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { pathname } = useLocation();
  const { data: versionData } = useQuery({
    queryKey: ["app-version"],
    queryFn: async () => {
      const res = await fetch("/api/version");
      if (!res.ok) return { version: null };
      return res.json() as Promise<{ version: string }>;
    },
    staleTime: Infinity,
  });
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(["Data Federation"]),
  );

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function isPathActive(path: string) {
    if (!project) return false;
    if (path === "") {
      return pathname === `/${project._id}` || pathname === `/${project._id}/`;
    }
    const href = `/${project._id}/${path}`;
    return pathname === href || pathname.startsWith(href + "/");
  }

  function getActiveChild(children: NavChild[]): string | undefined {
    if (!project) return undefined;
    return children
      .filter((child) => isPathActive(child.path))
      .sort((a, b) => b.path.length - a.path.length)[0]?.path;
  }

  return (
    <TooltipProvider>
      <div
        className={cn(
          "group/sidebar flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out overflow-hidden",
          collapsed ? "w-14" : "w-60",
        )}
      >
        <div className="flex h-14 items-center justify-between px-3">
          {!collapsed && (
            <div className="flex items-center gap-1.5 pl-1">
              <span className="text-lg font-semibold tracking-tight">
                archmax
              </span>
              {versionData?.version && (
                <span className="text-[10px] leading-none rounded-full px-1.5 py-0.5 bg-foreground/[0.08] text-sidebar-foreground/50 font-medium">
                  v{versionData.version}
                </span>
              )}
            </div>
          )}
          <button
            onClick={onToggle}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-foreground/[0.05] text-sidebar-foreground/60",
              collapsed && "mx-auto",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {!collapsed && (
          <div className="py-2">
            <ProjectSelector currentProject={project} />
          </div>
        )}

        <div className={cn("divider-subtle", collapsed ? "mx-2" : "mx-3")} />

        <ScrollArea className="flex-1">
          <nav
            className={cn(
              "flex flex-col gap-0.5",
              collapsed ? "items-center p-1.5" : "p-2",
            )}
          >
            {navItems.map((item) =>
              item.children
                ? renderGroup(item)
                : renderLeaf(item),
            )}
          </nav>
        </ScrollArea>

        <div className={cn("divider-subtle", collapsed ? "mx-2" : "mx-3")} />
        <UserMenu collapsed={collapsed} />
      </div>
    </TooltipProvider>
  );

  function renderGroup(item: Extract<NavItem, { children: NavChild[] }>) {
    const Icon = item.icon;
    const activeChild = getActiveChild(item.children);
    const groupActive = !!activeChild;
    const isOpen = openGroups.has(item.label) || groupActive;

    if (!project) {
      const inner = (
        <div
          key={item.label}
          className={cn(
            "flex items-center gap-3 rounded-full text-sm text-sidebar-foreground/30 cursor-not-allowed",
            collapsed ? "h-9 w-9 justify-center" : "px-3 py-2",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && item.label}
        </div>
      );

      if (collapsed) {
        return (
          <Tooltip key={item.label}>
            <TooltipTrigger asChild>{inner}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      }
      return inner;
    }

    if (collapsed) {
      const link = (
        <Link
          key={item.label}
          to={`/$projectId/${item.children[0].path}`}
          params={{ projectId: project._id }}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors",
            groupActive
              ? "bg-foreground/[0.08] text-sidebar-foreground font-medium"
              : "text-sidebar-foreground/70 hover:bg-foreground/[0.05] hover:text-sidebar-foreground",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
        </Link>
      );

      return (
        <Tooltip key={item.label}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <div key={item.label}>
        <button
          onClick={() => toggleGroup(item.label)}
          className={cn(
            "flex w-full items-center gap-3 rounded-full px-3 py-2 text-sm transition-colors",
            groupActive
              ? "text-sidebar-foreground font-medium"
              : "text-sidebar-foreground/70 hover:bg-foreground/[0.05] hover:text-sidebar-foreground",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 transition-transform text-sidebar-foreground/40",
              isOpen && "rotate-90",
            )}
          />
        </button>
        {isOpen && (
          <div className="flex flex-col gap-0.5 pl-7 pr-1 pb-0.5">
            {item.children.map((child) => (
              <Link
                key={child.path}
                to={`/$projectId/${child.path}`}
                params={{ projectId: project._id }}
                className={cn(
                  "flex items-center rounded-full px-3 py-1.5 text-sm transition-colors",
                  child.path === activeChild
                    ? "bg-foreground/[0.08] text-sidebar-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-foreground/[0.05] hover:text-sidebar-foreground",
                )}
              >
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderLeaf(item: Extract<NavItem, { path: string }>) {
    const { label, icon: Icon, path } = item;

    if (!project) {
      const inner = (
        <div
          key={label}
          className={cn(
            "flex items-center gap-3 rounded-full text-sm text-sidebar-foreground/30 cursor-not-allowed",
            collapsed ? "h-9 w-9 justify-center" : "px-3 py-2",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && label}
        </div>
      );

      if (collapsed) {
        return (
          <Tooltip key={label}>
            <TooltipTrigger asChild>{inner}</TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        );
      }
      return inner;
    }

    const isActive = isPathActive(path);
    const linkTo = path === "" ? "/$projectId" : `/$projectId/${path}`;

    const link = (
      <Link
        key={label}
        to={linkTo}
        params={{ projectId: project._id }}
        className={cn(
          "flex items-center gap-3 rounded-full text-sm transition-colors",
          collapsed ? "h-9 w-9 justify-center" : "px-3 py-2",
          isActive
            ? "bg-foreground/[0.08] text-sidebar-foreground font-medium"
            : "text-sidebar-foreground/70 hover:bg-foreground/[0.05] hover:text-sidebar-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && label}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip key={label}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return link;
  }
}
