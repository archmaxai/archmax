import type { Context, Next } from "hono";
import { getEnv } from "@archmax/core/config/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originFromHeader(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    // Origin header may itself be a bare origin like "https://example.com"
    // (no path). new URL() accepts that, so failures here mean garbage input.
    return null;
  }
}

/**
 * CSRF / origin enforcement for cookie-authenticated mutation routes.
 *
 * Real browsers always attach an `Origin` (or at minimum `Referer`) header on
 * cross-origin POST/PUT/PATCH/DELETE requests with credentials, so requiring
 * those headers to match `corsOrigins` blocks browser-driven CSRF without
 * needing a separate token round-trip. Server-to-server callers (CI, MCP
 * clients, tests using fetch from Node) typically omit both headers and are
 * not a CSRF vector — they authenticate via bearer tokens, not cookies.
 *
 * `/api/auth/*` is exempted because Better Auth applies its own protections
 * and runs before this middleware in app.ts.
 */
export async function csrfMiddleware(c: Context, next: Next) {
  if (SAFE_METHODS.has(c.req.method)) return next();
  if (c.req.path.startsWith("/api/auth/")) return next();

  const originHeader = c.req.header("origin");
  const refererHeader = c.req.header("referer");

  if (!originHeader && !refererHeader) {
    return next();
  }

  const trusted = new Set(getEnv().corsOrigins);

  const candidate = originHeader ?? refererHeader!;
  const origin = originFromHeader(candidate);

  if (!origin || !trusted.has(origin)) {
    return c.json({ error: "Forbidden: invalid request origin" }, 403);
  }

  await next();
}
