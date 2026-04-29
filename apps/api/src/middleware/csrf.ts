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
 * Every state-changing `/api/*` request (POST/PUT/PATCH/DELETE) is required
 * to carry an `Origin` (or `Referer`) header that resolves to one of
 * `corsOrigins`. Real browsers always attach `Origin` on credentialed
 * non-GET requests, so this stops browser-driven CSRF without needing a
 * separate token round-trip. Missing both headers is *also* rejected: the
 * routes below this middleware are session-cookie authenticated, so a
 * caller that suppresses Origin/Referer would otherwise drive cookie
 * mutations unprotected. Non-browser API clients should authenticate via
 * the dedicated bearer-token MCP surface (`/mcp/:slug/mcp`) instead.
 *
 * `/api/auth/*` is exempted because Better Auth runs before this middleware
 * in app.ts and applies its own CSRF protection.
 */
export async function csrfMiddleware(c: Context, next: Next) {
  if (SAFE_METHODS.has(c.req.method)) return next();
  if (c.req.path.startsWith("/api/auth/")) return next();

  const originHeader = c.req.header("origin");
  const refererHeader = c.req.header("referer");

  if (!originHeader && !refererHeader) {
    return c.json(
      { error: "Forbidden: missing Origin/Referer header" },
      403,
    );
  }

  const trusted = new Set(getEnv().corsOrigins);
  const candidate = originHeader ?? refererHeader!;
  const origin = originFromHeader(candidate);

  if (!origin || !trusted.has(origin)) {
    return c.json({ error: "Forbidden: invalid request origin" }, 403);
  }

  await next();
}
