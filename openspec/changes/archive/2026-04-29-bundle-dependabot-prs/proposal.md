# Change: Bundle Dependabot PRs per ecosystem

## Why
Dependabot currently opens one PR per `github-actions` and `docker` dependency, which creates review noise and CI load. The `npm` ecosystem already groups minor-and-patch updates into a single weekly PR; extending the same pattern to the remaining ecosystems keeps reviews focused and reduces merge overhead while still surfacing major (potentially breaking) bumps individually.

## What Changes
- Add a `groups` entry to the `github-actions` ecosystem in `.github/dependabot.yml` that bundles all minor and patch updates into one weekly PR.
- Add a `groups` entry to the `docker` ecosystem in `.github/dependabot.yml` that bundles all minor and patch updates into one weekly PR.
- Keep the existing `npm` `minor-and-patch` group as-is.
- Preserve current behavior for major updates across all ecosystems: they continue to open individual PRs so breaking changes are reviewed in isolation.
- Update the `dependency-automation` spec to require grouping for all three ecosystems.

## Impact
- Affected specs: `dependency-automation`
- Affected code: `.github/dependabot.yml`
- No runtime or application behavior changes; only GitHub's Dependabot PR cadence is affected.
