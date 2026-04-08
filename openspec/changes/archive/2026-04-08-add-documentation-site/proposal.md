# Change: Add documentation site with Starlight

## Why

The project is heading toward open-source release and needs a public documentation site. Documentation must live inside the monorepo so it stays in sync with code and spec changes, and it must integrate with the existing Turborepo + pnpm workspace workflow. A convention is also needed so that OpenSpec changes that affect user-facing behaviour carry a "update docs" task, keeping documentation current as features land.

## What Changes

- Add `apps/docs` workspace powered by Astro Starlight for static documentation
- Integrate into Turborepo build pipeline (`pnpm build` / `pnpm dev` include docs)
- Establish content structure: getting started, guides, MCP reference, self-hosting, contributing
- Add a build-time script that copies/symlinks OpenSpec specs into the docs content tree so published specs are always in sync
- Define a documentation-sync convention in `openspec/project.md`: changes that alter user-facing behaviour MUST include a docs update task
- Configure deployment as a static site (GitHub Pages / Cloudflare Pages), separate from the Docker image

## Impact

- Affected specs: none (new capability)
- Affected code: `pnpm-workspace.yaml`, `Dockerfile` (no change — docs deploy separately), `turbo.json` (docs build added), `openspec/project.md` (new convention)
- New dependency: `astro`, `@astrojs/starlight`
