import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Separator,
} from "@semlayer/ui";
import { Database, LogOut, Plus, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_auth/")({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const { data: dataSources, isLoading, refetch } = useQuery({
    queryKey: ["data-sources"],
    queryFn: async () => {
      const res = await api.api["data-sources"].$get();
      if (!res.ok) throw new Error("Failed to fetch data sources");
      return res.json();
    },
  });

  async function handleLogout() {
    await authClient.signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <div className="content-tight">
          <h1 className="text-heading text-2xl">Semantic Layer</h1>
          <p className="text-subtle text-sm">
            Manage database connections and semantic descriptions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => refetch()}>
            <RefreshCw className="size-4" />
          </Button>
          <Button size="sm">
            <Plus className="size-4" />
            Add Data Source
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleLogout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <Separator />

      <div className="flex-1 overflow-y-auto p-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-5" />
              Data Sources
            </CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading..."
                : `${dataSources?.length ?? 0} registered data sources`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-subtle py-8 text-center text-sm">
                Loading data sources...
              </div>
            ) : !dataSources?.length ? (
              <div className="text-subtle py-8 text-center text-sm">
                No data sources configured yet. Add one to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Tables</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataSources.map((ds) => (
                    <TableRow key={ds._id} className="cursor-pointer">
                      <TableCell className="font-medium">{ds.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ds.type}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {ds.description || "—"}
                      </TableCell>
                      <TableCell>{ds.tables?.length ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={ds.isActive ? "default" : "secondary"}>
                          {ds.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
