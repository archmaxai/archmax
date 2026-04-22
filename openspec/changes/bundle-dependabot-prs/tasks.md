## 1. Dependabot configuration
- [x] 1.1 Add a `groups` block to the `github-actions` entry in `.github/dependabot.yml` that bundles `minor` and `patch` updates (pattern `*`) into one weekly PR.
- [x] 1.2 Add a `groups` block to the `docker` entry in `.github/dependabot.yml` that bundles `minor` and `patch` updates (pattern `*`) into one weekly PR.
- [x] 1.3 Verify the updated YAML is schema-valid (`version: 2`, correct indentation) and that existing npm grouping is preserved.

## 2. Spec update
- [x] 2.1 Update `openspec/specs/dependency-automation/spec.md` (via delta) so that grouping is required for all three ecosystems.
- [x] 2.2 Run `openspec validate bundle-dependabot-prs --strict` and resolve any issues.
