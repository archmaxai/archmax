## MODIFIED Requirements

### Requirement: Project Model

The system SHALL provide a `Project` Mongoose model with the following fields: `title` (string, required, unique), `slug` (string, required, unique, indexed), `description` (string, optional), `ensureReadonly` (boolean, default `true`), `mcpPageSize` (number, default 50, min 10, max 200), `github` (optional subdocument with `owner` string, `repo` string, `branch` string default `"main"`, `encryptedToken` string), `createdAt` (Date), `updatedAt` (Date), `deleted` (boolean, default false), `deletedAt` (Date, optional).

The `slug` field SHALL be auto-generated from the `title` on creation by lowercasing, replacing non-alphanumeric characters with hyphens, collapsing consecutive hyphens, and trimming leading/trailing hyphens. If the generated slug collides with an existing project's slug, a numeric suffix SHALL be appended (e.g. `my-project-2`). The slug MAY be manually edited via the update API.

When `ensureReadonly` is `true` (the default), all SQL queries executed against the project's DuckDB instance MUST be validated as read-only before execution, and external database connections MUST be attached in read-only mode.

When `ensureReadonly` is `false`, application-level SQL validation is skipped and connections are attached without the `READ_ONLY` constraint, allowing write operations through DuckDB.

The `github` subdocument stores the GitHub OAuth integration state. The `owner` field stores the authenticated GitHub username. The `encryptedToken` field stores an AES-256-GCM encrypted OAuth access token. The plain-text token SHALL never be persisted or returned via API responses.

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

#### Scenario: GitHub OAuth connection stored on project

- **WHEN** a GitHub OAuth flow completes successfully for a project
- **THEN** the `github.owner` is set to the authenticated GitHub username
- **AND** the `github.encryptedToken` is stored as an AES-256-GCM encrypted value
- **AND** the plain-text token is not persisted

#### Scenario: Read project with GitHub connected

- **WHEN** a GET request retrieves a project with GitHub settings
- **THEN** the response includes `github.owner`, `github.repo`, and `github.branch`
- **AND** the response includes `github.connected: true`
- **AND** the encrypted token is never included in the response

#### Scenario: Disconnect GitHub

- **WHEN** a DELETE request is made to the GitHub disconnect endpoint for a project
- **THEN** the `github` subdocument is removed from the project
- **AND** subsequent publishes do not attempt GitHub push
