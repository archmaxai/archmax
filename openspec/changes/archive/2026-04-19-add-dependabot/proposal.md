# Change: Add Dependabot for automated dependency updates

## Why

The repository has no automated dependency management. Node, GitHub Actions, and Docker
base image versions drift silently, security advisories are easy to miss, and keeping
the monorepo on current releases relies on manual bumps. Dependabot is the lowest-effort
way to get weekly update PRs and security alerts against all three ecosystems we ship.

## What Changes

- Add `.github/dependabot.yml` configuring three ecosystems:
  - `npm` (pnpm) at the monorepo root, covering the pnpm workspace lockfile
  - `github-actions` for workflow action versions under `.github/workflows/`
  - `docker` for the base image in the root `Dockerfile`
- Group minor/patch updates per ecosystem so we get one PR per ecosystem per week instead
  of a storm of individual PRs; major updates stay as separate PRs for deliberate review.
- Apply consistent labels (`dependencies`, `github-actions`, `docker`) and a weekly
  schedule (Monday 06:00 Europe/Berlin) with an open-PR cap to keep the queue manageable.
- Add a brief **Dependency Updates** section to `CONTRIBUTING.md` describing contributor-
  facing behaviour (ecosystem table, grouping rules, CI gate, OpenSpec exemption) — but
  deliberately omitting the one-time GitHub UI toggles, which are a repo-admin concern
  handled out-of-band rather than a contributor workflow.

## Impact

- Affected specs: new capability `dependency-automation`.
- Affected code:
  - `.github/dependabot.yml` (new)
  - `CONTRIBUTING.md` (new contributor-facing "Dependency Updates" section)
- No runtime behaviour change; CI continues to run on every Dependabot PR via the existing
  `ci.yml` workflow (Dependabot PRs match the `on: pull_request` trigger under the
  `dependabot[bot]` identity).
- No OpenSpec process change needed: the existing exemption for "non-breaking dependency
  updates" in `openspec/project.md` already covers Dependabot-authored PRs.
