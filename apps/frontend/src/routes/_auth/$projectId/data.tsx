import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Database,
  Table2,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react";
import {
  cn,
  Button,
  Badge,
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@archsem/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

export const Route = createFileRoute("/_auth/$projectId/data")({
  component: DataBrowserPage,
});

interface DatabaseEntry {
  name: string;
}

interface TableEntry {
  schema: string;
  name: string;
}

interface Column {
  name: string;
  type: string;
}

interface TableDataResponse {
  columns: Column[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

interface SelectedTable {
  database: string;
  schema: string;
  table: string;
}

function DataBrowserPage() {
  const { project } = useProject();
  const [selected, setSelected] = useState<SelectedTable | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data: databases, isLoading: dbLoading } = useQuery({
    queryKey: ["data-browser", "databases", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["data-browser"].databases.$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to fetch databases");
      return res.json() as Promise<DatabaseEntry[]>;
    },
  });

  function handleSelectTable(database: string, schema: string, table: string) {
    setSelected({ database, schema, table });
    setPage(1);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <h1 className="text-heading text-2xl">Data Browser</h1>
        <p className="text-subtle text-sm">
          Browse federated data across all connected databases
        </p>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — database/table tree */}
        <div className="w-72 shrink-0">
          <ScrollArea className="h-full">
            <div className="p-3">
              {dbLoading ? (
                <div className="content-tight p-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-28" />
                </div>
              ) : !databases?.length ? (
                <div className="flex flex-col items-center py-12 content-tight">
                  <Database className="h-8 w-8 text-muted-foreground" />
                  <p className="text-subtle text-sm text-center">
                    No databases available. Add a connection first.
                  </p>
                </div>
              ) : (
                <div className="content-tight">
                  {databases.map((db) => (
                    <DatabaseNode
                      key={db.name}
                      projectId={project._id}
                      database={db.name}
                      selected={selected}
                      onSelect={handleSelectTable}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="divider-subtle w-px h-full" />

        {/* Right panel — table data */}
        <div className="flex-1 overflow-hidden">
          {selected ? (
            <TableDataView
              projectId={project._id}
              selected={selected}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-subtle text-sm">Select a table to view its data</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DatabaseNode({
  projectId,
  database,
  selected,
  onSelect,
}: {
  projectId: string;
  database: string;
  selected: SelectedTable | null;
  onSelect: (database: string, schema: string, table: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const { data: tables, isLoading } = useQuery({
    queryKey: ["data-browser", "tables", projectId, database],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["data-browser"].databases[":database"].tables.$get({
        param: { projectId, database },
      });
      if (!res.ok) throw new Error("Failed to fetch tables");
      return res.json() as Promise<TableEntry[]>;
    },
    enabled: open,
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-foreground/[0.05] transition-colors">
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{database}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 pl-2 py-0.5">
          {isLoading ? (
            <div className="content-tight px-2 py-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ) : !tables?.length ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">No tables</p>
          ) : (
            tables.map((t) => {
              const isActive =
                selected?.database === database &&
                selected?.schema === t.schema &&
                selected?.table === t.name;
              return (
                <button
                  key={`${t.schema}.${t.name}`}
                  onClick={() => onSelect(database, t.schema, t.name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1 text-sm transition-colors",
                    isActive
                      ? "bg-foreground/[0.08] font-medium"
                      : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  <Table2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t.name}</span>
                  {t.schema !== "main" && t.schema !== "public" && (
                    <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0">
                      {t.schema}
                    </Badge>
                  )}
                </button>
              );
            })
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TableDataView({
  projectId,
  selected,
  page,
  pageSize,
  onPageChange,
}: {
  projectId: string;
  selected: SelectedTable;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: [
      "data-browser",
      "data",
      projectId,
      selected.database,
      selected.schema,
      selected.table,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["data-browser"]
        .databases[":database"].tables[":schema"][":table"].data.$get({
          param: {
            projectId,
            database: selected.database,
            schema: selected.schema,
            table: selected.table,
          },
          query: { page: String(page), pageSize: String(pageSize) },
        });
      if (!res.ok) throw new Error("Failed to fetch table data");
      return res.json() as Promise<TableDataResponse>;
    },
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-destructive text-sm">Failed to load table data</p>
          </div>
        ) : data && data.rows.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-subtle text-sm">Table is empty</p>
          </div>
        ) : data ? (
          <Table className="[&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
            <TableHeader>
              <TableRow>
                {data.columns.map((col) => (
                  <TableHead key={col.name} className="h-12 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span>{col.name}</span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {col.type}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row, rowIdx) => (
                <TableRow key={rowIdx}>
                  {data.columns.map((col) => (
                    <TableCell key={col.name} className="font-mono text-xs max-w-xs truncate">
                      {formatCellValue(row[col.name])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </div>

      {data && (
        <>
        <div className="divider-subtle" />
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            {data.total.toLocaleString()} rows &middot; Page {page} of {totalPages}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => onPageChange(1)}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(totalPages)}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
