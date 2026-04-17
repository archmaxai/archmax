import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Database,
  Sparkles,
  KeyRound,
  Check,
  ArrowRight,
  ChevronRight,
  MessageSquareWarning,
  LayoutGrid,
  Activity,
  AlertCircle,
} from "lucide-react";
import { Card, Skeleton } from "@archmax/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

interface DayEntry {
  date: string;
  calls: number;
  errors: number;
}

interface DashboardStats {
  connections: { total: number; totalQueries: number };
  semanticModels: { total: number; openImprovements: number; totalDatasets: number };
  mcpAccess: { tokens: number; totalCalls: number; errorCalls: number; callsByDay: DayEntry[] };
}

export const Route = createFileRoute("/_auth/$projectId/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { project } = useProject();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", project._id],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"]["dashboard-stats"].$get({
        param: { projectId: project._id },
      });
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      return res.json() as Promise<DashboardStats>;
    },
  });

  const onboardingStep = useMemo(() => {
    if (!stats) return null;
    if (stats.connections.total === 0) return 1;
    if (stats.semanticModels.total === 0) return 2;
    if (stats.mcpAccess.tokens === 0) return 3;
    return null;
  }, [stats]);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {project.title}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Project overview and quick access
        </p>
      </header>

      {isLoading ? (
        <DashboardSkeleton />
      ) : onboardingStep !== null ? (
        <OnboardingFlow currentStep={onboardingStep} projectId={project._id} />
      ) : (
        <>
          <MetricCards stats={stats!} projectId={project._id} />
          <McpCallsChart data={stats!.mcpAccess.callsByDay} />
        </>
      )}

    </div>
  );
}

function MetricCards({
  stats,
  projectId,
}: {
  stats: DashboardStats;
  projectId: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <MetricCard
        icon={Database}
        label="Data Connections"
        value={stats.connections.totalQueries}
        valueSuffix="queries (14d)"
        to="/$projectId/connections"
        projectId={projectId}
        subStats={[
          {
            icon: Database,
            label: stats.connections.total === 1 ? "connection" : "connections",
            value: stats.connections.total,
          },
        ]}
      />

      <MetricCard
        icon={Sparkles}
        label="Semantic Models"
        value={stats.semanticModels.total}
        to="/$projectId/models"
        projectId={projectId}
        subStats={[
          {
            icon: LayoutGrid,
            label: "datasets",
            value: stats.semanticModels.totalDatasets,
          },
          ...(stats.semanticModels.openImprovements > 0
            ? [
                {
                  icon: MessageSquareWarning,
                  label: "open improvements",
                  value: stats.semanticModels.openImprovements,
                  accent: true as const,
                },
              ]
            : []),
        ]}
      />

      <MetricCard
        icon={KeyRound}
        label="MCP Access"
        value={stats.mcpAccess.totalCalls}
        valueSuffix={`calls (14d)`}
        to="/$projectId/mcp-access"
        projectId={projectId}
        subStats={[
          {
            icon: KeyRound,
            label: stats.mcpAccess.tokens === 1 ? "token" : "tokens",
            value: stats.mcpAccess.tokens,
          },
          ...(stats.mcpAccess.errorCalls > 0
            ? [
                {
                  icon: AlertCircle,
                  label: "errors (14d)",
                  value: stats.mcpAccess.errorCalls,
                  accent: true as const,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

interface SubStat {
  icon: typeof Database;
  label: string;
  value: number;
  accent?: boolean;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  valueSuffix,
  to,
  projectId,
  subStats,
}: {
  icon: typeof Database;
  label: string;
  value: number;
  valueSuffix?: string;
  to: string;
  projectId: string;
  subStats?: SubStat[];
}) {
  return (
    <Link to={to} params={{ projectId }} className="group block">
      <Card className="relative h-full overflow-hidden py-5 transition-colors hover:bg-card/80 dark:hover:bg-card/70">
        <div className="px-5 flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums tracking-tight">
                {value}
              </span>
              {valueSuffix && (
                <span className="text-sm text-muted-foreground">
                  {valueSuffix}
                </span>
              )}
            </div>
          </div>
          <div className="rounded-xl p-2.5" style={{ backgroundColor: "#c2d0e430" }}>
            <Icon className="h-5 w-5" style={{ color: "#8c987f" }} />
          </div>
        </div>

        {subStats && subStats.length > 0 && (
          <div className="px-5 mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            {subStats.map((s) => (
              <span
                key={s.label}
                className={`flex items-center gap-1 ${s.accent ? "text-amber-600 dark:text-amber-400" : ""}`}
              >
                <s.icon className="h-3 w-3" />
                {s.value} {s.label}
              </span>
            ))}
          </div>
        )}

        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
      </Card>
    </Link>
  );
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function McpCallsChart({ data }: { data: DayEntry[] }) {
  const chartData = useMemo(
    () => data.map((d) => ({ ...d, label: formatDateLabel(d.date) })),
    [data],
  );

  const hasData = data.some((d) => d.calls > 0 || d.errors > 0);

  return (
    <Card className="py-5">
      <div className="px-5 mb-4">
        <p className="text-sm font-medium text-muted-foreground">
          MCP calls — last 14 days
        </p>
      </div>
      <div className="px-5" style={{ height: 240 }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="fillCalls" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8c987f" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8c987f" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillErrors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8878a8" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#8878a8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <RechartsTooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-card)",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="calls"
                name="Calls"
                stroke="#8c987f"
                strokeWidth={2}
                fill="url(#fillCalls)"
              />
              <Area
                type="monotone"
                dataKey="errors"
                name="Errors"
                stroke="#8878a8"
                strokeWidth={2}
                fill="url(#fillErrors)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No MCP calls in the last 14 days
          </div>
        )}
      </div>
    </Card>
  );
}

const ONBOARDING_STEPS = [
  {
    title: "Create a data connection",
    description:
      "Connect to your databases (Postgres, MySQL, MSSQL, SQLite, or DuckDB) to start federating data.",
    icon: Database,
    path: "/$projectId/connections" as const,
    cta: "Add connection",
  },
  {
    title: "Create a semantic model",
    description:
      "Build a semantic layer that maps your database tables into meaningful datasets with fields, relationships, and metrics.",
    icon: Sparkles,
    path: "/$projectId/models" as const,
    cta: "Create model",
  },
  {
    title: "Try it via MCP",
    description:
      "Generate an MCP token so AI agents can query your semantic models and understand your data.",
    icon: KeyRound,
    path: "/$projectId/mcp-access" as const,
    cta: "Set up MCP access",
  },
];

function OnboardingFlow({
  currentStep,
  projectId,
}: {
  currentStep: number;
  projectId: string;
}) {
  return (
    <div className="space-y-3">
        {ONBOARDING_STEPS.map((step, i) => {
          const stepNum = i + 1;
          const isComplete = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          const isUpcoming = stepNum > currentStep;

          return (
            <Card
              key={step.title}
              className={`py-0 transition-colors ${
                isUpcoming ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center gap-4 px-5 py-4">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                    isComplete
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                      : isActive
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isComplete ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    stepNum
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${isComplete ? "text-muted-foreground line-through" : ""}`}
                  >
                    {step.title}
                  </p>
                  {isActive && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {step.description}
                    </p>
                  )}
                </div>

                {isActive && (
                  <Link
                    to={step.path}
                    params={{ projectId }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 shrink-0"
                  >
                    {step.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </Card>
          );
        })}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="py-5">
            <div className="px-5 flex items-start justify-between">
              <div className="space-y-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-16" />
              </div>
              <Skeleton className="h-10 w-10 rounded-xl" />
            </div>
            <div className="px-5 mt-3 flex gap-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          </Card>
        ))}
      </div>
      <Card className="py-5">
        <div className="px-5 mb-4">
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="px-5">
          <Skeleton className="h-[240px] w-full rounded-xl" />
        </div>
      </Card>
    </div>
  );
}
