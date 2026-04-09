import { Hono } from "hono";
import { getEnv } from "@archmax/core/config/env";
import { DocumentFileService, FileTooLargeError } from "@archmax/core/services/document-files";
import { AppError } from "../utils/errors";

function getDocService(): DocumentFileService {
  return new DocumentFileService(getEnv().ARCHMAX_DATA_DIR);
}

function param(c: { req: { param: (name: string) => string | undefined } }, name: string): string {
  const val = c.req.param(name);
  if (!val) throw AppError.badRequest(`Missing parameter: ${name}`);
  return val;
}

const app = new Hono()
  .get("/", async (c) => {
    const svc = getDocService();
    const docs = await svc.list(param(c, "projectId"));
    return c.json(docs);
  })

  .post("/upload", async (c) => {
    const projectId = param(c, "projectId");
    const svc = getDocService();

    const body = await c.req.parseBody();
    const file = body["file"];
    if (!file || !(file instanceof File)) {
      throw AppError.badRequest("No file provided in 'file' field");
    }

    const arrayBuf = await file.arrayBuffer();
    const data = Buffer.from(arrayBuf);

    try {
      const meta = await svc.upload(projectId, file.name, data);
      return c.json(meta, 201);
    } catch (err) {
      if (err instanceof FileTooLargeError) {
        return c.json({ error: err.message }, 413);
      }
      throw err;
    }
  })

  .get("/:filename", async (c) => {
    const projectId = param(c, "projectId");
    const filename = param(c, "filename");
    const svc = getDocService();

    if (!(await svc.exists(projectId, filename))) {
      throw AppError.notFound("Document not found");
    }

    const buf = await svc.get(projectId, filename);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Disposition": `attachment; filename="${filename}"` },
    });
  })

  .delete("/:filename", async (c) => {
    const projectId = param(c, "projectId");
    const filename = param(c, "filename");
    const svc = getDocService();

    const deleted = await svc.delete(projectId, filename);
    if (!deleted) throw AppError.notFound("Document not found");
    return c.json({ ok: true });
  });

export default app;
