import { Hono } from "hono";
import { logger } from "hono/logger";
import { corsMiddleware } from "./middleware/cors";
import { AppError } from "./utils/errors";
import { auth } from "./lib/auth";

import dataSources from "./routes/data-sources";
import semlayerMcp from "./mcp/semlayer-route";

const app = new Hono()
  .use("*", logger())
  .use("/api/*", corsMiddleware)
  .use("/api/*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) {
      c.res.headers.set("Cache-Control", "no-store");
    }
  })
  .get("/api/health", (c) => c.json({ status: "ok" }))
  .on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw))
  .route("/mcp/semlayer", semlayerMcp)
  .use("/api/*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await next();
  })
  .route("/api/data-sources", dataSources);

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      { error: err.message, ...(err.code ? { code: err.code } : {}) },
      err.statusCode as any,
    );
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export type AppType = typeof app;
export default app;
