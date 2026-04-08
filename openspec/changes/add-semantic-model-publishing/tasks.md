## 1. Directory Layout Migration

- [x] 1.1 Update `SemanticModelFileService` to use `src/` subdirectory for all path resolution (`projectDir` → `projectDir/src`)
- [x] 1.2 Add legacy layout fallback: check for `src/` first, fall back to root-level if `src/` doesn't exist
- [x] 1.3 Create migration script `apps/api/src/scripts/migrate-src-layout.ts` — moves YAML files and dataset dirs from root to `src/`; preserves `uploads/` and keeps `AGENTS.md` at project root
- [x] 1.4 Wire migration to run on startup in `apps/api/src/index.ts` (for each project, check if migration needed)
- [x] 1.5 Update `AGENTS.md` regeneration to write to project root (`<projectId>/AGENTS.md`), not inside `src/`
- [x] 1.6 Update existing tests for new `src/` paths

## 2. Build Assembly Service

- [x] 2.1 Create `packages/core/src/services/publish.ts` — `PublishService` class with `assemble(projectId, targetDir?)` method
- [x] 2.2 Implement `assemble`: read all source models, inline datasets, write fully-assembled single-file YAMLs to `targetDir` (default `build/`), clean stale files. Same code path used for persistent publish builds and temporary on-the-fly assembly for MCP testing
- [x] 2.3 Implement `computeSourceHash(projectId)` — SHA-256 of concatenated sorted source YAML content
- [x] 2.4 Write unit tests for build assembly (multi-model, stale cleanup, hash computation, custom target dir)

## 3. Publish Event Model & API

- [x] 3.1 Create `packages/core/src/models/PublishEvent.ts` — Mongoose model with project, message, modelNames, contentHash fields
- [x] 3.2 Create `apps/api/src/routes/publish.ts` — `POST /publish` (trigger publish) and `GET /publish/status` (change detection)
- [x] 3.3 Implement publish endpoint: call `assemble()`, compute hash, create `PublishEvent`, return event
- [x] 3.4 Implement status endpoint: compare current source hash with latest `PublishEvent.contentHash`
- [x] 3.5 Mount publish routes at `/api/projects/:projectId/publish` in `apps/api/src/app.ts`
- [x] 3.6 Write integration tests for publish and status endpoints

## 4. MCP Server: Unified Assembled-YAML Reading

- [x] 4.1 Refactor `registerSemlayerTools` to accept a `SemanticModelFileService` instance (injected, not constructed internally) — this lets callers point it at `build/` or a temp dir
- [x] 4.2 Production MCP route: pass a file service pointing at `build/`; add "no published models" fallback when `build/` is empty
- [x] 4.3 Testing MCP route: call `assemble(projectId, tempDir)` on-the-fly, then pass a file service pointing at the temp dir — shares all tool/digest/scope code with production
- [x] 4.4 Verify MCP tools never read split source files directly — always assembled single-file YAMLs
- [x] 4.5 Test both production and testing paths produce identical tool output for the same source data

## 5. GitHub OAuth Integration

- [x] 5.1 Add `@octokit/oauth-app` and `octokit` dependencies to `apps/api/package.json`
- [x] 5.2 Add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `ENCRYPTION_KEY` env vars to Zod env schema (all optional — required only when GitHub is used)
- [x] 5.3 Add `github` subdocument to `Project` schema: `owner` (string), `repo` (string), `branch` (string, default "main"), `encryptedToken` (string)
- [x] 5.4 Create encryption utility (`packages/core/src/infra/crypto.ts`) — `encrypt(plaintext, key)` and `decrypt(ciphertext, key)` using AES-256-GCM
- [x] 5.5 Create `apps/api/src/routes/github.ts` — `GET /authorize` (redirect to GitHub with `repo` scope, project ID in state), `GET /callback` (exchange code for token via `@octokit/oauth-app`, encrypt and store on project, redirect to settings)
- [x] 5.6 Add `GET /api/projects/:projectId/github/repos` — list repos the user has push access to (via stored OAuth token)
- [x] 5.7 Add `DELETE /api/projects/:projectId/github` — disconnect GitHub (remove subdocument and token)
- [x] 5.8 Update project read responses to include `github.connected`, `github.owner`, `github.repo`, `github.branch` — never expose the token
- [x] 5.9 Mount GitHub routes in `apps/api/src/app.ts`

## 6. Frontend: GitHub Settings Card

- [x] 6.1 Add GitHub integration card to `settings.tsx` — "Connect to GitHub" button when disconnected
- [x] 6.2 When connected: show GitHub username, repository selector dropdown (fetched from `/github/repos`), branch input, "Disconnect" button
- [x] 6.3 Hide the GitHub card entirely when `GITHUB_CLIENT_ID` is not configured (check via a health/config API)

## 7. GitHub Push on Publish

- [x] 7.1 Implement `pushToGitHub(projectId, message)` in publish route — decrypt token, create Octokit instance, read all files from `src/`, `uploads/`, `build/`, create blobs, tree, commit, and update ref
- [x] 7.2 Wire GitHub push into the publish endpoint (after successful local assembly; catch failures without blocking the publish event)
- [x] 7.3 Write tests for GitHub push (mock Octokit, verify tree structure and commit message)

## 8. Frontend: Publish Toolbar & Dialog

- [x] 8.1 Create `apps/frontend/src/components/publish-toolbar.tsx` — shared component with publish button, polls `/publish/status`
- [x] 8.2 Create publish dialog component — modal overlay with message textarea, publish/cancel buttons, loading state
- [x] 8.3 Add publish toolbar to `model-visualization.tsx` — between tab switcher and content, button on the right
- [x] 8.4 Add publish toolbar to the chat page (`$conversationId.tsx`) — at the top, button on the right
- [x] 8.5 Wire up TanStack Query for publish status polling and publish mutation
- [x] 8.6 Add success/error toast notifications for publish actions
