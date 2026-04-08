## Context

Semantic models are currently stored as YAML files on disk and served directly to MCP consumers. Any edit — whether from the agent chat or manual YAML changes — is immediately visible. This proposal adds a publishing gate between source edits and MCP consumption, with optional GitHub sync for version-controlled artifact storage.

The project data directory layout also needs restructuring to separate concerns: source models (`src/`), user uploads (`uploads/`), and published build artifacts (`build/`).

## Goals / Non-Goals

- **Goals:**
  - Controlled release of semantic model changes to MCP consumers
  - Audit trail of publish events with user-provided messages
  - Assembled (single-file) YAML builds for easy consumption
  - Optional GitHub push on publish for external version control
  - Clean directory separation: source, uploads, build artifacts

- **Non-Goals:**
  - Git-based branching or merge workflows within the app
  - Multi-user review/approval gates (single-user system)
  - Rollback to previous published versions (future work)
  - Diffing between published versions in the UI (future work)

## Decisions

### Directory layout

The per-project data directory changes from flat to structured:

```
<SEMLAYER_DATA_DIR>/<projectId>/
├── AGENTS.md                     # Auto-generated summary (project root, always current)
├── src/                          # Source YAML files (editable)
│   ├── model_name.yaml           # Model root file
│   └── model_name/               # Per-dataset files
│       ├── dataset_a.yaml
│       └── dataset_b.yaml
├── uploads/                      # User-uploaded documents (unchanged from add-document-uploads)
│   └── data_dictionary.pdf
└── build/                        # Published artifacts (read-only, generated)
    └── model_name.yaml           # Fully assembled single-file YAML
```

**Rationale:** Separating `src/` from `build/` makes the publishing boundary explicit. The `build/` directory is a pure output — it can be deleted and regenerated from source at any time.

**Alternative considered:** Using a database collection for published snapshots. Rejected because YAML files are already the primary storage format, and disk-based builds are simpler to push to GitHub.

### Publish mechanism

Publishing is always an explicit user action (never automatic). It is a server-side operation that:
1. Reads all source models from `src/`
2. For each model, assembles root + dataset files into a single fully-assembled YAML (with inline datasets)
3. Writes assembled files to `build/`
4. Creates a `PublishEvent` document in MongoDB with the message, timestamp, and model names
5. If GitHub is configured, pushes the project directory to the connected repo

**Rationale:** Build assembly is cheap (YAML merge) and keeps the `build/` directory self-contained. MongoDB stores the audit log because it's already the operational database.

### MCP always reads assembled YAMLs

The MCP server has a single code path for reading semantic models: it always reads from a directory of assembled single-file YAMLs. It never reads split source files (root + per-dataset) directly. This applies to both production and testing:

- **Published (production):** MCP reads from `build/`, populated by an explicit publish action
- **Testing endpoint:** MCP assembles source files from `src/` into a temporary build on-the-fly, then reads from that

Both paths converge on the same `SemanticModelFileService` instance pointed at a directory of assembled YAMLs. The assembly step is the only place that understands split-file layout; the MCP layer never does.

If `build/` is empty (no publish has occurred), the production MCP returns an empty model list with a hint that models need to be published first.

**Rationale:** One code path eliminates divergence between what testing shows and what production serves. Assembly is cheap (YAML merge), so the overhead of a temp build for testing is negligible. The MCP tool registration, digest generation, and scope filtering logic are shared without any conditionals.

**Alternative considered:** Having MCP read split files directly with a different `SemanticModelFileService` mode. Rejected because it doubles the reading logic and creates subtle format differences between testing and production.

### Change detection for publish button

The publish button is enabled when the source models differ from the last published build. Detection strategy:
- On each publish, store a content hash (SHA-256 of concatenated sorted source YAML files) in the `PublishEvent`
- The API exposes a `GET /api/projects/:projectId/publish/status` endpoint returning `{ hasUnpublishedChanges: boolean, lastPublishedAt: Date | null, lastMessage: string | null }`
- The frontend polls this endpoint (or receives it alongside model queries) to toggle the publish button

**Alternative considered:** File-watching with checksums. Rejected as overly complex for a single-user system; polling the hash on model fetch is sufficient.

### GitHub integration

Uses **GitHub OAuth App** authentication via `@octokit/oauth-app` (v8, ~5M weekly downloads). This library handles the full OAuth web flow — authorization URL generation, code-for-token exchange, and token lifecycle — with built-in Node.js middleware.

**Flow:**
1. Admin configures `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` env vars (from a registered GitHub OAuth App)
2. User clicks "Connect to GitHub" in project settings
3. Browser redirects to `https://github.com/login/oauth/authorize` with `repo` scope
4. GitHub redirects back to `/api/github/callback` with an authorization code
5. `@octokit/oauth-app` exchanges the code for an access token server-side
6. The token is encrypted (AES-256-GCM) and stored on the Project document alongside the authenticated GitHub username
7. User selects a target repository from their accessible repos (fetched via the token)

**Stored on the Project model:**
- `github.owner` — GitHub username (from OAuth)
- `github.repo` — selected repository name (e.g. `semlayer-models`)
- `github.branch` — target branch (default `main`)
- `github.encryptedToken` — AES-256-GCM encrypted OAuth access token

**On publish**, a `PublishService` uses an Octokit instance (authenticated with the decrypted token) to:
1. Get the current tree SHA for the branch
2. Create blobs for all files under `src/`, `uploads/`, and `build/`
3. Create a new tree and commit with the publish message
4. Update the branch ref

**Rationale:** OAuth provides a proper browser-based consent flow — no manual PAT creation/pasting required. `@octokit/oauth-app` makes this straightforward with its middleware handling the callback exchange. The `repo` scope grants read/write access to repositories the user has access to.

**Alternative considered:** GitHub App (installation-based). More fine-grained permissions and short-lived tokens, but requires the admin to register a GitHub App with a private key, which adds operational complexity. Can be migrated to later if multi-user support is added.

**Alternative considered:** Personal access tokens (PAT). Simpler to implement but worse UX — requires users to manually create and paste tokens from GitHub settings.

### Token encryption

The GitHub OAuth access token is encrypted at rest using AES-256-GCM with a key derived from `ENCRYPTION_KEY` env var (required when GitHub integration is used). The token is decrypted only when needed for API calls (repo listing, push operations). The plaintext token is never returned via API responses.

### OAuth callback routing

The OAuth callback endpoint (`GET /api/github/callback`) receives the `code` and `state` parameters from GitHub. The `state` parameter encodes the `projectId` so the callback knows which project to associate the token with. After successful token exchange and encryption, the browser is redirected back to the project settings page.

## Risks / Trade-offs

- **Migration required** — Moving from `<projectId>/<model>.yaml` to `<projectId>/src/<model>.yaml` requires a one-time migration script. Mitigation: provide a migration script that moves files and updates paths; the file service falls back to the old layout if `src/` doesn't exist.
- **GitHub OAuth token security** — Storing OAuth tokens in MongoDB even encrypted carries risk. Mitigation: AES-256-GCM encryption, token is never returned via API (only `connected: true/false` + username), encryption key is a required env var.
- **OAuth App registration** — Requires the admin to register a GitHub OAuth App and configure client ID/secret. Mitigation: one-time setup, well-documented by GitHub, and env vars are already the standard config mechanism.
- **Build directory size** — Assembled YAMLs duplicate data from source. Mitigation: acceptable for semantic models (typically KB-range files).
- **No rollback** — Once published, there's no built-in way to revert. Mitigation: GitHub history provides external rollback capability; in-app rollback is future work.

## Migration Plan

1. Add migration script `apps/api/src/scripts/migrate-src-layout.ts`
2. Script detects old layout (YAML files directly under `<projectId>/`) and moves them to `<projectId>/src/`
3. Script preserves `uploads/` if it already exists (from add-document-uploads)
4. Script runs automatically on app startup if `src/` doesn't exist but YAML files are found at root level
5. Fallback: `SemanticModelFileService` checks for `src/` first, falls back to root if not found (graceful degradation during rollout)

## Open Questions

None at this time.
