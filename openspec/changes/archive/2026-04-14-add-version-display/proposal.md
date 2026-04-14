# Change: Add version display beside branding

## Why
Users and operators have no way to tell which version of archmax they are running. Showing the current release version as a tag-style badge next to the logo helps with debugging, support conversations, and verifying that upgrades completed successfully.

## What Changes
- **Dockerfile**: Accept `APP_VERSION` build arg, pass it to Vite and the API runtime as an environment variable
- **Release workflow**: Forward the resolved semver version as a Docker build arg
- **PR Docker workflow**: Forward the PR number as a dev version identifier
- **Frontend sidebar**: Display a small pill badge (e.g. `v0.3.1`) next to the "archmax" text in the sidebar header
- **Docs site**: Display the same pill badge next to the logo in the Starlight navbar header; inject version from the latest git tag during docs CI build
- **Health endpoint**: Include `version` field in `/api/health` response for programmatic checks

## Impact
- Affected specs: `deployment`, `frontend-shell`, `documentation-site`
- Affected code: `Dockerfile`, `.github/workflows/release.yml`, `.github/workflows/pr-docker-build.yml`, `.github/workflows/docs.yml`, `apps/frontend/src/components/layout/app-sidebar.tsx`, `apps/docs/astro.config.mjs`, `apps/docs/src/styles/custom.css`, `packages/core/src/infra/health.ts`
