import { useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Plus, FolderOpen, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@semlayer/ui";
import { api } from "@/lib/api";
import type { Project } from "@/lib/project-context";
import { CreateProjectDialog } from "@/components/create-project-dialog";

export function ProjectSelector({ currentProject }: { currentProject: Project | null }) {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api.api.projects.$get();
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json() as Promise<Project[]>;
    },
    refetchInterval: 30_000,
  });

  return (
    <>
      <div className="px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              ref={triggerRef}
              className="flex w-full items-center gap-3 rounded-full px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/[0.05] min-w-0"
            >
              <FolderOpen className="h-4 w-4 shrink-0 text-sidebar-foreground/70" />
              <span className="flex-1 truncate font-medium">
                {currentProject?.title ?? "Select a project"}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="bottom"
            sideOffset={4}
            className="w-[var(--radix-dropdown-menu-trigger-width)]"
          >
            {projects?.map((p) => (
              <DropdownMenuItem
                key={p._id}
                onClick={() =>
                  navigate({
                    to: "/$projectId/connections",
                    params: { projectId: p._id },
                  })
                }
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                <span className="truncate">{p.title}</span>
                {currentProject && p._id === currentProject._id && (
                  <Check className="ml-auto h-4 w-4" />
                )}
              </DropdownMenuItem>
            ))}
            {!projects?.length && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No projects yet
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CreateProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
