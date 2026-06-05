## ADDED Requirements

### Requirement: Firebird Connection Form

The connection-management UI SHALL list **Firebird** as a selectable connection type in the create/edit form's type dropdown only when the server reports the Firebird capability as active (via the `firebirdEnabled` flag). When the flag is `false` or unavailable, Firebird SHALL NOT appear in the dropdown.

When **Firebird** is selected, the form SHALL present the structured **Connection Details** fields Host, Port, Database, User, Password, and Charset (plus the shared name, slug, description, and schema controls). The Port field SHALL default to `3050` and the Charset field SHALL default to `UTF8`. The Database field SHALL be labelled to indicate it is the database path or alias as seen on the Firebird host machine (e.g. `C:\firebird.fdb`). The **Connection URI** tab SHALL remain available for Firebird. The password field SHALL remain write-only as for other types.

#### Scenario: Firebird shown when capability active

- **WHEN** the server reports `firebirdEnabled: true` and the user opens the connection form
- **THEN** **Firebird** appears as an option in the type dropdown

#### Scenario: Firebird hidden when capability inactive

- **WHEN** the server reports `firebirdEnabled: false` (or the flag is unavailable)
- **THEN** **Firebird** does not appear in the type dropdown

#### Scenario: Firebird uses structured relational fields with defaults

- **WHEN** the user selects type **Firebird** with the Connection Details tab
- **THEN** Host, Port, Database, User, Password, and Charset inputs are shown
- **AND** the Port field defaults to `3050` and the Charset field defaults to `UTF8`
- **AND** the Database field indicates it is the path/alias as seen on the Firebird host machine
- **AND** submitting the form sends `type: "firebird"` with the entered parameters to the connections API
