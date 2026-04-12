## ADDED Requirements

### Requirement: First-Login Disclaimer

After the first successful login, the system SHALL display a modal disclaimer dialog that blocks access to the admin UI until the user acknowledges all statements. The disclaimer MUST include the following points:

- Large semantic models can cost a significant number of tokens; users must monitor their LLM cost carefully, as the framework is based on long-running agents.
- The semantic model builder agent can put substantial load on the source database system when exploring schemas. With data lakes or large tables, this may cause significant data scans. The agent tries to minimize this and will ask before running expensive operations, but cannot guarantee it.
- Schema metadata (table names, column names, sample data, distinct values) is sent to the configured LLM provider during model building. This may include personally identifiable information (PII) depending on the source data.
- AI-generated semantic models may contain inaccuracies and should be reviewed before use.

The user MUST check an acknowledgment checkbox and confirm to dismiss the dialog. Acceptance SHALL be persisted in the browser's `localStorage`. The dialog SHALL NOT appear again once accepted, unless `localStorage` is cleared.

#### Scenario: Disclaimer shown on first login

- **WHEN** a user logs in for the first time (no acceptance in `localStorage`)
- **THEN** a modal disclaimer dialog is displayed over the admin UI
- **AND** the dialog cannot be dismissed without checking the acknowledgment checkbox and clicking confirm

#### Scenario: Disclaimer not shown after acceptance

- **WHEN** a user has previously accepted the disclaimer (acceptance stored in `localStorage`)
- **AND** the user logs in again
- **THEN** the disclaimer dialog is not displayed
- **AND** the user proceeds directly to the admin UI

#### Scenario: Disclaimer re-appears after localStorage cleared

- **WHEN** a user clears their browser's `localStorage`
- **AND** the user logs in again
- **THEN** the disclaimer dialog is displayed as if it were the first login
