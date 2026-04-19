# Tasks

## 1. Dependabot configuration

- [x] 1.1 Create `.github/dependabot.yml` with `version: 2` and three `updates:` entries:
      `npm` (directory `/`), `github-actions` (directory `/`), and `docker`
      (directory `/`, targeting the root `Dockerfile`).
- [x] 1.2 Set a weekly schedule (`interval: weekly`, `day: monday`, `time: "06:00"`,
      `timezone: "Europe/Berlin"`) for every ecosystem.
- [x] 1.3 Cap open PRs per ecosystem (`open-pull-requests-limit: 5` for npm, `3` for
      github-actions and docker) and set `labels` to `["dependencies"]` plus an
      ecosystem-specific label.
- [x] 1.4 Group npm minor + patch updates under a `minor-and-patch` group so we get
      one weekly PR instead of many; keep major updates ungrouped for deliberate review.
- [x] 1.5 Add a `commit-message` prefix per ecosystem (`chore(deps)`, `chore(ci)`,
      `chore(docker)`) so Dependabot PRs are immediately distinguishable in the log.

## 2. Documentation

- [x] 2.1 Add a concise **Dependency Updates** section to `CONTRIBUTING.md` covering the
      ecosystem table, grouping rules, CI gate, and the Dependabot OpenSpec exemption.
      Do **not** include GitHub UI setup instructions — those are a repo-admin concern.

## 3. Validation

- [x] 3.1 Run `openspec validate add-dependabot --strict` and resolve any issues.
- [ ] 3.2 After merge, confirm the first Dependabot run appears under the repo's
      **Insights → Dependency graph → Dependabot** tab within one week (manual
      verification; not code).
