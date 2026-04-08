## MODIFIED Requirements

### Requirement: Project Model

The system SHALL provide a `Project` Mongoose model with the following fields: `title` (string, required, unique), `slug` (string, required, unique, indexed), `description` (string, optional), `ensureReadonly` (boolean, default `true`), `createdAt` (Date), `updatedAt` (Date), `deleted` (boolean, default false), `deletedAt` (Date, optional).

The `slug` field SHALL be auto-generated from the `title` on creation by lowercasing, replacing non-alphanumeric characters with hyphens, collapsing consecutive hyphens, and trimming leading/trailing hyphens. If the generated slug collides with an existing project's slug, a numeric suffix SHALL be appended (e.g. `my-project-2`). The slug MAY be manually edited via the update API.

When `ensureReadonly` is `true` (the default), all SQL queries executed against the project's DuckDB instance MUST be validated as read-only before execution, and external database connections MUST be attached in read-only mode.

When `ensureReadonly` is `false`, application-level SQL validation is skipped and connections are attached without the `READ_ONLY` constraint, allowing write operations through DuckDB.

#### Scenario: Create a project with auto-generated slug

- **WHEN** a project is created with title `"My Shopify Store"`
- **THEN** a slug `"my-shopify-store"` is auto-generated
- **AND** the project is persisted with the title, slug, `ensureReadonly: true`, and `deleted: false`

#### Scenario: Slug collision appends suffix

- **WHEN** a project is created with title `"Analytics"` and a project with slug `"analytics"` already exists
- **THEN** the new project receives slug `"analytics-2"`

#### Scenario: Update project slug

- **WHEN** a PUT request updates the slug to `"store-prod"`
- **THEN** the project's slug is updated if the new slug is unique and valid

#### Scenario: Create a project with default ensureReadonly

- **WHEN** a project is created with a title and no `ensureReadonly` value
- **THEN** a new Project document is persisted with `ensureReadonly: true`, `deleted: false`, and `createdAt`/`updatedAt` set automatically

#### Scenario: Create a project with ensureReadonly disabled

- **WHEN** a project is created with `ensureReadonly: false`
- **THEN** the project is persisted with `ensureReadonly: false`
- **AND** queries against this project's DuckDB instance are not subject to read-only validation

#### Scenario: Unique title enforcement

- **WHEN** a project is created with a title that already exists (among non-deleted projects)
- **THEN** a duplicate key error is returned
