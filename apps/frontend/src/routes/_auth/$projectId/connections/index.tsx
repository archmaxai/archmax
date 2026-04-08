import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Database,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  Zap,
} from "lucide-react";
import {
  Button,
  Badge,
  Card,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@archsem/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@archsem/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@archsem/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@archsem/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

export const Route = createFileRoute("/_auth/$projectId/connections/")({
  component: ConnectionsPage,
});

interface Connection {
  _id: string;
  name: string;
  slug: string;
  type: string;
  description: string;
  isActive: boolean;
  connectionConfig: {
    host?: string;
    port?: number;
    database?: string;
    schema?: string;
    user?: string;
    uri?: string;
  };
  createdAt: string;
}

const CONNECTION_TYPES = [
  "postgres",
  "mysql",
  "mssql",
  "sqlite",
  "duckdb",
  "motherduck",
  "other",
] as const;

function ConnectionsPage() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const [editing, setEditing] = useState<Connection | null>(null);
  const { data: connections, isLoading } = useQuery({
    queryKey: ["connections", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"].connections.$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to fetch connections");
      return res.json() as unknown as Promise<Connection[]>;
    },
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.projects[":projectId"].connections[":id"].$delete({
        param: { projectId: project._id, id },
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections", project._id] });
      setDeleteTarget(null);
      toast.success("Connection deleted");
    },
  });

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(conn: Connection) {
    setEditing(conn);
    setFormOpen(true);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="content-tight">
            <h1 className="text-heading text-2xl">Data Sources</h1>
            <p className="text-subtle text-sm">
              Add external databases to the {project.title} federation.
              Connected sources are queryable as a single unified catalog.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Connection
          </Button>
        </div>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex-1 overflow-y-auto p-8 space-y-6">

        {isLoading ? (
          <p className="text-subtle py-8 text-center text-sm">Loading...</p>
        ) : !connections?.length ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <Database className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No connections yet. Add one to connect your databases.
            </p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Host / URI</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((conn) => (
                  <TableRow key={conn._id}>
                    <TableCell className="font-medium">{conn.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{conn.slug}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{conn.type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate text-sm">
                      {conn.connectionConfig.uri ??
                        conn.connectionConfig.host ??
                        "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={conn.isActive ? "default" : "secondary"}>
                        {conn.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(conn)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTarget(conn)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <ConnectionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        projectId={project._id}
        editing={editing}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Connection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SCHEMA_TYPES = new Set(["postgres", "mysql", "mssql"]);

function ConnectionFormDialog({
  open,
  onOpenChange,
  projectId,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  editing: Connection | null;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState<string>("postgres");
  const [connMode, setConnMode] = useState<"fields" | "uri">("fields");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [database, setDatabase] = useState("");
  const [schema, setSchema] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [uri, setUri] = useState("");
  const [description, setDescription] = useState("");

  function autoSlug(n: string): string {
    let s = n.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
    if (/^[0-9]/.test(s)) s = `_${s}`;
    return s || "";
  }

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setSlug(editing.slug);
      setSlugTouched(true);
      setType(editing.type);
      setHost(editing.connectionConfig.host ?? "");
      setPort(editing.connectionConfig.port?.toString() ?? "");
      setDatabase(editing.connectionConfig.database ?? "");
      setSchema(editing.connectionConfig.schema ?? "");
      setUser(editing.connectionConfig.user ?? "");
      setPassword("");
      setUri(editing.connectionConfig.uri ?? "");
      setDescription(editing.description);
      setConnMode(editing.connectionConfig.uri ? "uri" : "fields");
    } else {
      setName("");
      setSlug("");
      setSlugTouched(false);
      setType("postgres");
      setHost("");
      setPort("");
      setDatabase("");
      setSchema("");
      setUser("");
      setPassword("");
      setUri("");
      setDescription("");
      setConnMode("fields");
    }
  }, [open, editing]);

  const showSchema = SCHEMA_TYPES.has(type);

  const mutation = useMutation({
    mutationFn: async () => {
      const config: Record<string, unknown> = {};
      if (connMode === "uri") {
        if (uri) config.uri = uri;
      } else {
        if (host) config.host = host;
        if (port) config.port = Number(port);
        if (database) config.database = database;
        if (user) config.user = user;
        if (password) config.password = password;
      }
      if (schema) config.schema = schema;

      const effectiveSlug = slug || autoSlug(name);

      if (editing) {
        const res = await api.api.projects[":projectId"].connections[":id"].$put({
          param: { projectId, id: editing._id },
          json: { name, slug: effectiveSlug, type: type as any, connectionConfig: config, description },
        });
        if (!res.ok) throw new Error("Failed to update");
        return res.json();
      }

      const res = await api.api.projects[":projectId"].connections.$post({
        param: { projectId },
        json: { name, slug: effectiveSlug, type: type as any, connectionConfig: config, description },
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections", projectId] });
      onOpenChange(false);
      toast.success(editing ? "Connection updated" : "Connection created");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const res = await api.api.projects[":projectId"].connections[":id"].test.$post({
        param: { projectId, id: editing._id },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as any)?.error ?? "Connection test failed");
      }
      return res.json();
    },
    onSuccess: () => toast.success("Connection is healthy"),
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Connection" : "New Connection"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="content-group"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="content-tight">
              <Label htmlFor="conn-name">Name</Label>
              <Input
                id="conn-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(autoSlug(e.target.value));
                }}
                required
              />
            </div>
            <div className="content-tight">
              <Label htmlFor="conn-type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONNECTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="content-tight">
            <Label htmlFor="conn-slug">Slug (DuckDB prefix)</Label>
            <Input
              id="conn-slug"
              value={slug || (!slugTouched ? autoSlug(name) : "")}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder={autoSlug(name) || "my_database"}
              className="font-mono"
            />
            <p className="text-muted-foreground text-xs">
              Used as the schema name when querying via DuckDB
            </p>
          </div>

          <Tabs
            value={connMode}
            onValueChange={(v) => setConnMode(v as "fields" | "uri")}
          >
            <TabsList variant="pill" className="w-full">
              <TabsTrigger value="fields" className="flex-1">
                Connection Details
              </TabsTrigger>
              <TabsTrigger value="uri" className="flex-1">
                Connection URI
              </TabsTrigger>
            </TabsList>

            <TabsContent value="uri" className="content-tight pt-2">
              <Label htmlFor="conn-uri">URI</Label>
              <Input
                id="conn-uri"
                value={uri}
                onChange={(e) => setUri(e.target.value)}
                placeholder="postgres://user:pass@host:5432/db"
              />
            </TabsContent>

            <TabsContent value="fields" className="content-group pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="content-tight">
                  <Label htmlFor="conn-host">Host</Label>
                  <Input
                    id="conn-host"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div className="content-tight">
                  <Label htmlFor="conn-port">Port</Label>
                  <Input
                    id="conn-port"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="5432"
                    type="number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="content-tight">
                  <Label htmlFor="conn-db">Database</Label>
                  <Input
                    id="conn-db"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                  />
                </div>
                <div className="content-tight">
                  <Label htmlFor="conn-user">User</Label>
                  <Input
                    id="conn-user"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                  />
                </div>
                <div className="content-tight">
                  <Label htmlFor="conn-pass">Password</Label>
                  <Input
                    id="conn-pass"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {showSchema && (
            <div className="content-tight">
              <Label htmlFor="conn-schema">Schema</Label>
              <Input
                id="conn-schema"
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                placeholder="public"
              />
              <p className="text-muted-foreground text-xs">
                Limits the data browser and AI agent to tables in this schema
                (e.g. "public"). Leave empty to show all schemas.
              </p>
            </div>
          )}

          <div className="content-tight">
            <Label htmlFor="conn-desc">Description</Label>
            <Textarea
              id="conn-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            {editing && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                disabled={testMutation.isPending}
                onClick={() => testMutation.mutate()}
              >
                {testMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                Test Connection
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || mutation.isPending}>
              {mutation.isPending
                ? "Saving..."
                : editing
                  ? "Save Changes"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
