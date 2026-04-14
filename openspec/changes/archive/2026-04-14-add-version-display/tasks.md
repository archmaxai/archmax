## 1. Docker & CI Pipeline

- [x] 1.1 Add `ARG APP_VERSION=dev` to Dockerfile; set `ENV APP_VERSION` in production stage
- [x] 1.2 Update `.github/workflows/release.yml` docker build step to pass `build-args: APP_VERSION=${{ needs.release.outputs.version }}`
- [x] 1.3 Update `.github/workflows/pr-docker-build.yml` docker build step to pass `build-args: APP_VERSION=pr-${{ github.event.pull_request.number }}`

## 2. API Version Endpoint

- [x] 2.1 Add `APP_VERSION` to the Zod env schema in `packages/core/src/config/env.ts` (optional string, default `"dev"`)
- [x] 2.2 Add authenticated `GET /api/version` endpoint in `apps/api/src/app.ts` (below session auth middleware)

## 3. Frontend Version Badge

- [x] 3.1 Add `useQuery` in `app-sidebar.tsx` to fetch version from `GET /api/version` with `staleTime: Infinity`
- [x] 3.2 Render pill badge next to "archmax" text; hide when sidebar is collapsed

## 4. Docs Version Badge

- [x] 4.1 Update `.github/workflows/docs.yml` to resolve latest `v*` git tag and export `APP_VERSION` env var before the Astro build
- [x] 4.2 Create a custom Starlight `SiteTitle` component override in `apps/docs/src/components/SiteTitle.astro` that renders the logo plus a version badge
- [x] 4.3 Register the component override in `astro.config.mjs` under `starlight({ components: { SiteTitle: ... } })`
- [x] 4.4 Style the badge in `apps/docs/src/styles/custom.css` using Starlight design tokens

## 5. Verification

- [x] 5.1 Run `pnpm typecheck && pnpm lint` to confirm no regressions
