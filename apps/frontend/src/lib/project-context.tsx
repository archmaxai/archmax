import { createContext, useContext, type ReactNode } from "react";

export interface Project {
  _id: string;
  title: string;
  slug: string;
  description: string;
  mcpPageSize: number;
  github?: {
    connected: boolean;
    owner: string;
    repo: string;
    branch: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface ProjectContextValue {
  project: Project;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({
  project,
  children,
}: {
  project: Project;
  children: ReactNode;
}) {
  return (
    <ProjectContext.Provider value={{ project }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}
