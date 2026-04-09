import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { getEnv } from "@archmax/core/config/env";
import { semanticModelSchema, customExtensionSchema } from "@archmax/core/services/semantic-model-schema";
import { SemanticModelFileService } from "@archmax/core/services/semantic-model-files";
import { AppError } from "../utils/errors";

function getFileService(): SemanticModelFileService {
  return new SemanticModelFileService(getEnv().ARCHMAX_DATA_DIR);
}

function param(c: { req: { param: (name: string) => string | undefined } }, name: string): string {
  const val = c.req.param(name);
  if (!val) throw AppError.badRequest(`Missing parameter: ${name}`);
  return val;
}

const app = new Hono()
  .get("/", async (c) => {
    const svc = getFileService();
    const models = await svc.list(param(c, "projectId"));
    return c.json(models);
  })
  .get("/:name", async (c) => {
    const svc = getFileService();
    const model = await svc.get(param(c, "projectId"), param(c, "name"));
    if (!model) throw AppError.notFound("Semantic model not found");
    return c.json(model);
  })
  .post("/", zValidator("json", semanticModelSchema), async (c) => {
    const projectId = param(c, "projectId");
    const svc = getFileService();
    const body = c.req.valid("json");

    if (await svc.exists(projectId, body.name)) {
      throw AppError.conflict(`Semantic model "${body.name}" already exists`);
    }

    await svc.write(projectId, body);
    return c.json(body, 201);
  })
  .put("/:name", zValidator("json", semanticModelSchema), async (c) => {
    const projectId = param(c, "projectId");
    const name = param(c, "name");
    const svc = getFileService();

    if (!(await svc.exists(projectId, name))) {
      throw AppError.notFound("Semantic model not found");
    }

    const body = c.req.valid("json");

    if (body.name !== name) {
      await svc.delete(projectId, name);
    }

    await svc.write(projectId, body);
    return c.json(body);
  })
  .get("/:name/yaml", async (c) => {
    const svc = getFileService();
    const yamlContent = await svc.getRawYaml(param(c, "projectId"), param(c, "name"));
    if (!yamlContent) throw AppError.notFound("Semantic model not found");
    return c.text(yamlContent);
  })
  .patch(
    "/:name/datasets/:datasetName/extensions",
    zValidator("json", z.object({ custom_extensions: z.array(customExtensionSchema) })),
    async (c) => {
      const svc = getFileService();
      const body = c.req.valid("json");
      const updated = await svc.updateDatasetExtensions(
        param(c, "projectId"),
        param(c, "name"),
        param(c, "datasetName"),
        body.custom_extensions,
      );
      if (!updated) throw AppError.notFound("Dataset not found");
      return c.json({ ok: true });
    },
  )
  .delete("/:name", async (c) => {
    const projectId = param(c, "projectId");
    const name = param(c, "name");
    const svc = getFileService();

    const deleted = await svc.delete(projectId, name);
    if (!deleted) throw AppError.notFound("Semantic model not found");
    return c.json({ ok: true });
  });

export default app;
