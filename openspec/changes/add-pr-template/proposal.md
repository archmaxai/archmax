# Change: Add GitHub Pull Request Template

## Why

Contributors currently have no structured guidance when opening PRs. A PR template enforces the project's conventions — OpenSpec change inclusion, release labelling, testing, and quality checks — directly in the GitHub UI, reducing review friction and missed steps.

## What Changes

- Add `.github/PULL_REQUEST_TEMPLATE.md` with sections for description, related changes, spec compliance, testing, and release labelling
- Template encodes the project's existing Git workflow rules (spec changes required for user-facing PRs, release labels, CI checks)

## Impact

- Affected specs: none (new capability: `contribution-workflow`)
- Affected code: `.github/PULL_REQUEST_TEMPLATE.md` (new file)
- No breaking changes; purely additive contributor tooling
