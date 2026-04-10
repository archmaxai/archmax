# contribution-workflow Specification

## Purpose
TBD - created by archiving change add-pr-template. Update Purpose after archive.
## Requirements
### Requirement: Pull Request Template

The repository SHALL provide a GitHub pull request template at `.github/PULL_REQUEST_TEMPLATE.md` that pre-fills the PR body when contributors open new pull requests.

#### Scenario: New PR opened via GitHub UI

- **WHEN** a contributor opens a new pull request on GitHub
- **THEN** the PR body is pre-filled with the template contents

#### Scenario: Template enforces spec compliance

- **WHEN** the template is rendered
- **THEN** it includes a checklist item reminding contributors to include an OpenSpec change proposal for user-facing changes

### Requirement: PR Template Sections

The pull request template SHALL include structured sections that guide contributors through the project's quality and release conventions.

#### Scenario: Template contains required sections

- **WHEN** a contributor views the pre-filled PR body
- **THEN** the template contains a summary section for describing what changed and why
- **AND** the template contains a field for linking related OpenSpec change proposals or issues
- **AND** the template contains a change type selector (feature, bug fix, refactor, docs, tooling)
- **AND** the template contains a quality checklist (tests pass, lint clean, typecheck clean, spec delta included if user-facing)
- **AND** the template contains release label guidance referencing `release`, `release:minor`, and `release:major`

#### Scenario: Exempt change types skip spec requirement

- **WHEN** a contributor selects bug fix, docs, or tooling as the change type
- **THEN** the spec delta checklist item is clearly marked as optional for those types

