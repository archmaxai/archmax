## ADDED Requirements

### Requirement: Firebird Connection Form

The connection-management UI SHALL list **Firebird** as a selectable connection type in the create/edit form's type dropdown only when the server reports the Firebird capability as active (via the `firebirdEnabled` flag). When the flag is `false` or unavailable, Firebird SHALL NOT appear in the dropdown.

When **Firebird** is selected, the form SHALL present the same structured **Connection Details** fields as Postgres/MySQL — Host, Port, Database, User, Password (plus the shared name, slug, description, and schema controls) — and SHALL default the Port field to `3050`. The **Connection URI** tab SHALL remain available for Firebird. The password field SHALL remain write-only as for other types.

#### Scenario: Firebird shown when capability active

- **WHEN** the server reports `firebirdEnabled: true` and the user opens the connection form
- **THEN** **Firebird** appears as an option in the type dropdown

#### Scenario: Firebird hidden when capability inactive

- **WHEN** the server reports `firebirdEnabled: false` (or the flag is unavailable)
- **THEN** **Firebird** does not appear in the type dropdown

#### Scenario: Firebird uses structured relational fields with default port

- **WHEN** the user selects type **Firebird** with the Connection Details tab
- **THEN** Host, Port, Database, User, and Password inputs are shown
- **AND** the Port field defaults to `3050`
- **AND** submitting the form sends `type: "firebird"` with the entered parameters to the connections API
