# dependency-automation Specification

## Purpose
TBD - created by archiving change add-dependabot. Update Purpose after archive.
## Requirements
### Requirement: Dependabot Version Updates

The repository SHALL ship a `.github/dependabot.yml` configuration (schema
`version: 2`) that instructs GitHub Dependabot to raise version-update pull
requests on a weekly schedule for every ecosystem in use by the monorepo.

The configuration MUST cover, at minimum:

- the `npm` ecosystem at the repository root, so the pnpm workspace lockfile
  (`pnpm-lock.yaml`) is tracked;
- the `github-actions` ecosystem at the repository root, so the workflows under
  `.github/workflows/` stay on supported action versions;
- the `docker` ecosystem at the repository root, so the base image referenced in
  the root `Dockerfile` is tracked.

Each ecosystem entry MUST declare a weekly `schedule`, an
`open-pull-requests-limit`, and at least one GitHub label so Dependabot PRs are
discoverable in the PR list.

Minor and patch `npm` updates MUST be grouped into a single weekly pull request
via a Dependabot `groups` entry; major updates MUST remain ungrouped so breaking
bumps get their own review.

#### Scenario: Weekly pnpm workspace update PR is raised

- **WHEN** a new minor or patch release is available for any dependency in the
  root `package.json` (or any workspace package) during Dependabot's weekly run
- **THEN** Dependabot opens a single pull request titled with the
  `chore(deps)` prefix that bumps `pnpm-lock.yaml` and the affected
  `package.json` files
- **AND** the PR is labelled `dependencies`

#### Scenario: GitHub Actions version bump

- **WHEN** an action used in `.github/workflows/*.yml` has a newer release
- **THEN** Dependabot opens a pull request updating the pinned action version
- **AND** the PR is labelled `dependencies` and `github-actions`

#### Scenario: Dockerfile base image bump

- **WHEN** a newer tag is available for the base image referenced in the root
  `Dockerfile`
- **THEN** Dependabot opens a pull request updating the `FROM` directive
- **AND** the PR is labelled `dependencies` and `docker`

#### Scenario: Major upgrade stays ungrouped

- **WHEN** a dependency publishes a new major version during the same weekly run
  as minor/patch updates
- **THEN** the major bump appears in its own pull request, separate from the
  grouped minor-and-patch PR

