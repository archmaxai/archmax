import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../utils/errors";

/**
 * Creates a Hono test app that mounts a route sub-app at a given base path
 * with the AppError handler and an optional auth bypass.
 *
 * Usage:
 * ```ts
 * import testAgentsRoute from "./routes/test-agents";
 * const app = createTestApp("/api/projects/:projectId/test-agents", testAgentsRoute);
 * const res = await app.request("/api/projects/p1/test-agents", { method: "GET" });
 * ```
 */
export function createTestApp(basePath: string, route: Hono<any>) {
  const app = new Hono();

  app.route(basePath, route);

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        { error: err.message, ...(err.code ? { code: err.code } : {}) },
        err.statusCode as ContentfulStatusCode,
      );
    }
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}

/**
 * Helper to parse JSON response.
 */
export async function jsonBody<T = unknown>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}
