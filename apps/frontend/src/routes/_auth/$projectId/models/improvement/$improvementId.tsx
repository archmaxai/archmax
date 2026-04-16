import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Check, ArrowRight, Calendar, Bot } from "lucide-react";
import { Button, Badge, Card } from "@archmax/ui";
import { api } from "@/lib/api";
import { useProject } from "@/lib/project-context";

interface ImprovementDetail {
  _id: string;
  modelName: string;
  title: string;
  description: string;
  status: "pending" | "implemented";
  implementedAt: string | null;
  createdVia: string;
  createdAt: string;
}

export const Route = createFileRoute(
  "/_auth/$projectId/models/improvement/$improvementId",
)({
  component: ImprovementRoute,
});

function ImprovementRoute() {
  const { projectId, improvementId } = Route.useParams();
  const { project } = useProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: improvement } = useQuery<ImprovementDetail>({
    queryKey: ["improvement", improvementId],
    queryFn: async () => {
      const res = await api.api.projects[":projectId"].improvements[":id"].$get({
        param: { projectId, id: improvementId },
      });
      if (!res.ok) throw new Error("Improvement not found");
      return res.json() as unknown as Promise<ImprovementDetail>;
    },
  });

  if (!improvement) return null;

  const isImplemented = improvement.status === "implemented";

  async function handleImplement() {
    await api.api.projects[":projectId"].improvements[":id"].implement.$patch({
      param: { projectId, id: improvementId },
    });
    queryClient.invalidateQueries({ queryKey: ["improvement", improvementId] });
    queryClient.invalidateQueries({ queryKey: ["improvements", project._id] });
    navigate({
      to: "/$projectId/models/chat/$conversationId",
      params: { projectId: project._id, conversationId: "new" },
      search: { prefill: improvement!.description },
    });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 py-6">
        <div className="flex items-start justify-between">
          <div className="content-tight">
            <h1 className="text-heading text-2xl">{improvement.title}</h1>
            <p className="text-subtle text-sm">
              Improvement request for {improvement.modelName}
            </p>
          </div>
          {isImplemented ? (
            <Badge variant="secondary" className="gap-1.5">
              <Check className="h-3 w-3" />
              Implemented {improvement.implementedAt
                ? new Date(improvement.implementedAt).toLocaleDateString()
                : ""}
            </Badge>
          ) : (
            <Button size="sm" onClick={handleImplement} className="gap-1.5">
              Implement
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </header>

      <div className="divider-subtle mx-8" />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex max-w-xl flex-col gap-4">
          <Card className="p-6">
            <div className="flex gap-3">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(improvement.createdAt).toLocaleDateString()}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Bot className="h-3 w-3" />
                    via <strong className="text-foreground">{improvement.createdVia}</strong>
                  </span>
                </div>

                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="whitespace-pre-wrap">{improvement.description}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
