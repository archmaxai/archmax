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
 * Compute the public origin the browser sees when the API sits behind a
 * reverse proxy (nginx, Cloudflare, etc.) — derived from the standard
 * `X-Forwarded-Proto` + `X-Forwarded-Host` headers the proxy sets.
 *
 * Returns `null` when those headers are absent. In that case the request
 * is not proxied (or the proxy is misconfigured), and the caller falls
 * back to the explicit `corsOrigins` allow-list — which is what
 * `APP_BASE_URL` / `CORS_ORIGINS` already configures for direct
 * deployments.
 */
function proxiedSelfOrigin(c: Context): string | null {
  const forwardedHost = c.req
    .header("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  if (!forwardedHost) return null;

  const forwardedProto =
    c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  return `${forwardedProto}://${forwardedHost}`;
}

/**
 * CSRF / origin enforcement for cookie-authenticated mutation routes.
 *
 * Every state-changing `/api/*` request (POST/PUT/PATCH/DELETE) is required
 * to carry an `Origin` (or `Referer`) header. The header is accepted when
 * either:
 *   1. it matches one of the configured `corsOrigins` (driven by
 *      `APP_BASE_URL` / `CORS_ORIGINS` — the canonical config for direct
 *      deployments and local dev), OR
 *   2. it matches the public origin derived from `X-Forwarded-Proto` +
 *      `X-Forwarded-Host` headers set by the upstream reverse proxy.
 *
 * Case (2) lets deployments behind nginx / Cloudflare / a tunnel work
 * out of the box without the operator having to keep `APP_BASE_URL` in
 * sync with the public URL: a same-origin request from the browser to its
 * own server is, by definition, not CSRF. Real browsers always attach
 * `Origin` on credentialed non-GET requests, so an attacker on a foreign
 * origin cannot forge a same-origin `Origin` header.
 *
 * Missing both `Origin` and `Referer` is also rejected: the routes below
 * this middleware are session-cookie authenticated, so a caller that
 * suppresses both headers would otherwise drive cookie mutations
 * unprotected. Non-browser API clients should authenticate via the
 * dedicated bearer-token MCP surface (`/mcp/:slug/mcp`) instead.
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

  const candidate = originHeader ?? refererHeader!;
  const origin = originFromHeader(candidate);

  if (!origin) {
    return c.json({ error: "Forbidden: invalid request origin" }, 403);
  }

  const trusted = new Set(getEnv().corsOrigins);
  if (trusted.has(origin)) {
    return next();
  }

  const selfOrigin = proxiedSelfOrigin(c);
  if (selfOrigin && origin === selfOrigin) {
    return next();
  }

  return c.json({ error: "Forbidden: invalid request origin" }, 403);
}
