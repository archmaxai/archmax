## 1. Critical: DuckDB Hardening for Agent Queries
- [x] 1.1 Add `hardenConnection(db)` call in `makeExecuteQueryTool` (`packages/core/src/services/agent-tools.ts:36`) before `db.prepare(sql)`
- [x] 1.2 Add unit test verifying `hardenConnection` is called in the agent tool path

## 2. Critical: SSRF Protection on Test Agent URLs
- [x] 2.1 Create a `validateSafeUrl(url: string)` utility in `packages/core/src/infra/` that resolves DNS and rejects private/loopback/link-local/metadata IPs
- [x] 2.2 Apply URL validation in `POST /test-agents` and `PUT /test-agents/:agentId` for `llmBaseUrl`
- [x] 2.3 Apply URL validation in `POST /test-agents/:agentId/test-connection` before the outbound `fetch`
- [x] 2.4 Add unit tests for the URL validation utility (private IPs, loopback, metadata, valid public URLs)

## 3. Critical: Require ENCRYPTION_KEY for API Key Storage
- [x] 3.1 In `POST /test-agents` and `PUT /test-agents/:agentId`, return 400 when `apiKey` is provided but `ENCRYPTION_KEY` is not set
- [x] 3.2 Add test verifying plaintext fallback is rejected

## 4. Critical: Connection Config Schema Tightening
- [x] 4.1 Replace `.passthrough()` with `.strict()` on `connectionConfigSchema` in `apps/api/src/routes/connections.ts`
- [x] 4.2 Add `.regex(IDENTIFIER_RE)` validation to the `schema` field in `connectionConfigSchema`
- [x] 4.3 Add `IDENTIFIER_RE` validation for database, schema, and table params on all data browser endpoints (`apps/api/src/routes/data-browser.ts`)
- [x] 4.4 Update existing connection tests to ensure extra fields are rejected

## 5. High: GitHub OAuth Timing-Safe Comparison
- [x] 5.1 Replace `Buffer.equals()` with `crypto.timingSafeEqual()` in `verifyOAuthState` (`apps/api/src/routes/github.ts:55-58`)
- [x] 5.2 Pad buffers to equal length before comparison to handle length mismatch without early return

## 6. High: CSRF / Content-Type Enforcement
- [x] 6.1 Add middleware in `apps/api/src/app.ts` that rejects POST/PUT/PATCH/DELETE requests to `/api/*` without `Content-Type: application/json` (except multipart upload endpoints)
- [x] 6.2 Add test verifying form-encoded requests are rejected with 415

## 7. High: Remove Tracked Build Artifacts
- [x] 7.1 Add `apps/docs/.astro/` to root `.gitignore`
- [x] 7.2 Run `git rm -r --cached apps/docs/.astro/`
- [x] 7.3 Run `git rm --cached skills-lock.json` (already gitignored but still tracked)

## 8. Medium: MCP Session Token Re-validation
- [x] 8.1 Store `tokenId` in the `McpSession` interface (`apps/api/src/mcp/archmax-route.ts`)
- [x] 8.2 On session reuse (when `mcp-session-id` is provided), look up the token by `tokenId` and verify it is not deleted or expired
- [x] 8.3 Return 401 and remove the session if the token is no longer valid

## 9. Medium: Nginx Security Headers
- [x] 9.1 Add `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` to `apps/frontend/nginx.conf`

## 10. Low: Non-Root Docker User
- [x] 10.1 Add `RUN useradd -r -s /bin/false archmax` and `USER archmax` to the production stage of `Dockerfile`
- [x] 10.2 Ensure `/app/data/projects` and `/tmp/redis` are owned by the `archmax` user
- [x] 10.3 Configure nginx to run as non-root (use `pid /tmp/nginx.pid`, listen on 8080 without privilege)

## 11. Low: Auth Hardening
- [x] 11.1 Add explicit cookie configuration (`httpOnly`, `secure`, `sameSite`) in `apps/api/src/lib/auth.ts`
- [x] 11.2 Change `UI_PASSWORD` validation in `packages/core/src/config/env.ts` from `z.string()` to `z.string().min(8)`

## 12. Verification
- [x] 12.1 Run `pnpm typecheck` — must pass
- [x] 12.2 Run `pnpm test` — must pass
- [ ] 12.3 Build Docker image and verify container starts with non-root user
