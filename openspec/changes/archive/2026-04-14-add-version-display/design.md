## Context

The app currently has no version tracking in the UI or API responses. The release workflow already resolves a semver version from git tags, but that value is never embedded into the build artifacts. The docs site deploys separately via GitHub Pages and has no access to the Docker build args.

Three surfaces need the version: the frontend SPA (Docker-built), the docs site (Astro/GitHub Pages), and an authenticated API endpoint.

## Goals / Non-Goals

- Goals:
  - Display the current semver version as a tag-style badge in the frontend sidebar and docs navbar
  - Make the version available programmatically via an authenticated API endpoint
  - Fall back gracefully to "dev" during local development

- Non-Goals:
  - Version pinning across workspace `package.json` files (those remain independent)
  - Committed `CHANGELOG.md` (GitHub Release notes are sufficient)
  - Version display on the login page (low value, logo is minimal there)
  - Exposing version on unauthenticated endpoints (health, config)

## Decisions

### Version source: git tags (via CI)

The release workflow already resolves the latest `v*` tag. This is the single source of truth for the deployed version. No additional version file or package.json sync is needed.

- Alternatives considered:
  - Root `package.json` version field: would require a version bump commit on every release, adding noise to the git history
  - A `version.json` file: extra file to maintain, same problem

### API injection: `APP_VERSION` environment variable read at startup

The `APP_VERSION` env var is set via Docker build arg at image build time and read once at startup via the Zod env schema. An authenticated `GET /api/version` endpoint returns it. This keeps version info behind the session auth middleware, avoiding leaking deployment details to unauthenticated scanners.

The Dockerfile declares `ARG APP_VERSION=dev` and sets `ENV APP_VERSION=$APP_VERSION` in the production stage. When running outside Docker (local dev), it defaults to "dev".

- Alternatives considered:
  - Adding version to `/api/health` or `/api/config`: both are unauthenticated public endpoints, leaking deployment version info
  - Vite build-time injection (`VITE_APP_VERSION`): couples the SPA build to the deployment version; if someone serves a cached SPA bundle against a newer API, the version would be stale

### Frontend: runtime fetch from authenticated endpoint

The sidebar fetches `GET /api/version` via a `useQuery` with `staleTime: Infinity` (fetched once per session). This keeps the displayed version in sync with the actual running backend, regardless of SPA bundle caching.

- Alternatives considered:
  - Vite `import.meta.env.VITE_APP_VERSION`: bakes version into the SPA at build time, can drift from the running backend
  - Piggybacking on `/api/config`: that endpoint is unauthenticated

### Docs injection: git tag at build time in CI

The `docs.yml` workflow resolves the latest `v*` tag and sets `APP_VERSION` as an environment variable. The Astro build reads `import.meta.env.APP_VERSION` in a custom Starlight `SiteTitle` component override. For local dev, falls back to "dev".

### Badge styling

Both surfaces use the same visual treatment: a small pill badge (`text-[10px]`, `rounded-full`, muted background) immediately to the right of the brand name/logo. The text is prefixed with `v` (e.g., `v0.3.1`). In the frontend, the badge uses `bg-foreground/[0.08] text-sidebar-foreground/50`. In the docs site, the badge uses Starlight's `--sl-color-gray-5` background with `--sl-color-gray-2` text.

The badge is hidden when the sidebar is collapsed (frontend only).

## Risks / Trade-offs

- **Stale version in docs**: The docs site only rebuilds on push to `main`, so the version badge lags behind patch releases that don't touch docs content. Acceptable since the docs workflow runs on every push to main, and the release merge commit triggers it.
- **Version mismatch in PR builds**: PR Docker builds show `pr-<number>`, not a real semver. This is intentional and helps distinguish pre-release builds.
- **Extra fetch in sidebar**: One small authenticated request per session. Negligible overhead, and `staleTime: Infinity` ensures no refetching.

## Open Questions

None.
