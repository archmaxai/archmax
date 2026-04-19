## Context

The application currently uses a GitHub OAuth App flow to connect projects to GitHub repositories. This requires server-side `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` env vars, an OAuth redirect dance, and Octokit-based tree/blob/commit API calls to push files. This is being replaced with a simpler model: each project directory is a local Git repo, publishing creates commits, and an optional PAT enables push/pull to GitHub.

**Stakeholders**: Self-hosted single-user deployments. No multi-tenancy concerns.

## Goals / Non-Goals

**Goals:**
- Every project directory is a Git repository (auto-initialized)
- Publishing = `git add . && git commit` (via isomorphic-git)
- Encrypted PAT + GitHub repo URL in project settings for upstream sync
- Pull/merge before commit to handle upstream changes
- Clear error messages for conflicts, auth issues, network failures
- 3 revert tools: revert file, discard all, commit history
- Agent can understand and resolve Git conflicts in YAML
- Graceful UI degradation when YAML has conflict markers
- Minimal commit history in project settings UI

**Non-Goals:**
- Multi-branch workflows (only one configurable branch per project)
- Full Git UI (diff viewer, blame) — keep minimal
- SSH key auth (PAT over HTTPS only)
- GitHub-specific features beyond push/pull (PRs, issues, actions)
- Supporting non-GitHub remotes (GitHub HTTPS only)

## Decisions

### Git library: `isomorphic-git`

**Decision**: Use `isomorphic-git` for all Git operations.

**Why**: Pure JavaScript implementation, no native dependencies, no CLI wrapper. Supports init, add, commit, push, pull, merge, log, checkout, statusMatrix. Works with `node:fs` directly. Well-maintained (1.1M weekly downloads). The API is functional (each operation is a standalone function import), making it tree-shakeable.

**Alternatives considered**:
- `simple-git` — wrapper around the `git` CLI binary; requires git installed on the host, which adds a Docker dependency and makes operations harder to control programmatically. Rejected per requirement.
- `nodegit` / `libgit2` bindings — native C library bindings; complex build, platform-specific issues in Docker. Rejected.
- Direct GitHub API via Octokit — current approach; doesn't provide local versioning, can't do pull/merge, no revert. Rejected.

### Authentication: Encrypted GitHub PAT

**Decision**: Store a GitHub Personal Access Token encrypted with AES-256-GCM using the existing `ENCRYPTION_KEY` infrastructure (`packages/core/src/infra/crypto.ts`). The PAT is entered directly in project settings — no OAuth redirect flow.

**Why**: Simpler than OAuth for a single-user tool. No GitHub App registration needed. Reuses existing encryption infrastructure. The PAT authenticates HTTPS push/pull against GitHub.

### Commit author: Fixed "archmax" identity

**Decision**: All Git commits use `archmax <archmax@localhost>` as both author and committer. Not configurable.

**Why**: Single-user tool; there's no need to distinguish authors. Keeps the configuration surface minimal.

### Repository initialization

**Decision**: Initialize a Git repo (`git init`) when a project is created or on first access (lazy init). The `.gitignore` file excludes `build/` (derived output) and any temp files.

**Why**: Lazy init handles migration of existing projects. The `build/` directory is generated from `src/` on each publish, so it shouldn't be versioned.

### Revert tools (3 tools)

1. **Revert file** — `git checkout HEAD -- <path>` equivalent; restores a single file to the last committed version
2. **Discard all changes** — `git checkout HEAD -- .` equivalent; restores all files to the last committed state
3. **Commit history** — `git log` equivalent; returns recent commits for the project

These are exposed as API endpoints and available in the agent's tool set.

### Conflict handling

**Decision**: When `pull` results in merge conflicts, the conflicted files are written to disk with standard Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). The API returns a structured error listing the conflicted file paths. The YAML parser in `SemanticModelFileService.list()` already skips invalid models with a warning — conflict-marked files will naturally fail YAML parsing. The frontend graph/tree views detect this and show an inline error banner. The model still appears in the sidebar list (from the filename) but cannot be visualized until conflicts are resolved.

### Branch model

**Decision**: Single branch per project, configurable in settings (default `main`). No branch switching, no multi-branch workflows.

**Why**: Semantic model projects are typically linear; branching adds complexity without clear benefit for the target use case.

### File listing filtering

**Decision**: All file listing paths (SemanticModelFileService, DocumentFileService, agent filesystem, publish collectFiles) skip entries starting with `.` in directory traversals. This excludes `.git/` and any other dotfiles/dotdirs.

**Why**: `.git/` contents should never appear in model listings, be pushed as semantic model content, or be accessible to the AI agent.

## Risks / Trade-offs

- **`isomorphic-git` merge limitations** → isomorphic-git's merge support is basic (fast-forward + simple 3-way). Complex merges may fail and leave conflicts. Mitigation: clear error messages + agent can resolve manually.
- **Large repos** → Binary files or large YAML sets could slow Git operations. Mitigation: projects are typically small (tens of YAML files); `.gitignore` excludes `build/`.
- **Migration** → Existing projects won't have a `.git` directory. Mitigation: lazy init on first access creates the repo and makes an initial commit.

## Migration Plan

1. Remove `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from env schema (breaking — documented in changelog)
2. Keep `ENCRYPTION_KEY` (still used for PAT encryption)
3. Mongoose schema: restructure `github` subdoc (replace `owner`/`repo` with `url`, keep `branch`/`encryptedToken`)
4. Data migration: if a project has `github.owner` and `github.repo`, derive `github.url` as `https://github.com/{owner}/{repo}.git`; token stays encrypted
5. Lazy git init: on first publish or sync, if `.git/` doesn't exist, initialize and create initial commit

## Resolved Questions

- **Commit author**: Fixed `archmax <archmax@localhost>` identity. Not configurable.
- **Commit log in UI**: Yes — a minimal commit history section is shown in project settings, displaying recent commits (message, timestamp).
