import { createFileRoute } from "@tanstack/react-router";
import { ModelVisualization } from "@/components/model-visualization/model-visualization";

export const Route = createFileRoute("/_auth/$projectId/models/$modelName")({
  component: ModelRoute,
});

function ModelRoute() {
  const { projectId, modelName } = Route.useParams();

  return (
    <ModelVisualization projectId={projectId} modelName={modelName} />
  );
}
