## ADDED Requirements

### Requirement: Credential Encryption at Rest

The system SHALL encrypt sensitive credential fields in `connectionConfig` before persisting to MongoDB when the `ENCRYPTION_KEY` environment variable is set. The `password` field SHALL be encrypted using AES-256-GCM via the shared `encrypt()` helper. The `uri` field, when it contains an embedded password, SHALL be encrypted in its entirety. When `ENCRYPTION_KEY` is not set, credentials SHALL be stored in plaintext (matching test-agent behavior). All code paths that consume stored credentials (DuckDB attach, test-connection, data browser) SHALL decrypt before use. API response redaction SHALL first decrypt the stored value (if encrypted), then apply the existing `********` sentinel replacement.

#### Scenario: Password encrypted on create when ENCRYPTION_KEY is set

- **WHEN** a connection is created with `connectionConfig.password: "s3cret"` and `ENCRYPTION_KEY` is configured
- **THEN** the persisted MongoDB document contains an AES-256-GCM encrypted value in `connectionConfig.password`
- **AND** the API response still returns `connectionConfig.password` as `********`

#### Scenario: URI encrypted on create when ENCRYPTION_KEY is set

- **WHEN** a connection is created with `connectionConfig.uri: "postgres://user:pass@host/db"` and `ENCRYPTION_KEY` is configured
- **THEN** the persisted MongoDB document contains an encrypted value in `connectionConfig.uri`

#### Scenario: Plaintext fallback when ENCRYPTION_KEY is absent

- **WHEN** a connection is created with `connectionConfig.password: "s3cret"` and `ENCRYPTION_KEY` is not configured
- **THEN** the password is stored as plaintext in MongoDB (current behavior preserved)

#### Scenario: Credentials decrypted for DuckDB attach

- **WHEN** a connection with encrypted credentials is attached to a project's DuckDB instance
- **THEN** the credentials are decrypted before building the ATTACH string

#### Scenario: Credentials decrypted for test-connection

- **WHEN** a test-connection request is made for a connection with encrypted credentials
- **THEN** the credentials are decrypted before attempting the connectivity test

## MODIFIED Requirements

### Requirement: Credential Preservation on Update

The PUT endpoint SHALL preserve stored credentials when the client sends back redacted values. If the incoming `connectionConfig.password` equals the sentinel value (`********`) or is empty/absent, the server SHALL keep the previously stored password. If the incoming `connectionConfig.uri` contains the sentinel in its password portion, the server SHALL keep the previously stored URI. When `ENCRYPTION_KEY` is set and the client provides a new (non-sentinel, non-empty) password, the server SHALL encrypt the new value before persisting. This prevents accidental overwrite of credentials with redacted placeholders.

#### Scenario: Sentinel password is preserved

- **WHEN** a PUT request sends `connectionConfig.password` as `********`
- **THEN** the server retains the existing stored password (encrypted or plaintext) and does not overwrite it with the sentinel

#### Scenario: Empty password is preserved

- **WHEN** a PUT request sends `connectionConfig.password` as an empty string or omits it entirely
- **THEN** the server retains the existing stored password

#### Scenario: New password overwrites stored value

- **WHEN** a PUT request sends a `connectionConfig.password` that is neither empty nor the sentinel
- **AND** `ENCRYPTION_KEY` is configured
- **THEN** the server encrypts the new password with AES-256-GCM and stores the encrypted value

#### Scenario: New password stored plaintext without ENCRYPTION_KEY

- **WHEN** a PUT request sends a new `connectionConfig.password`
- **AND** `ENCRYPTION_KEY` is not configured
- **THEN** the server stores the new password as plaintext

#### Scenario: Sentinel in URI is preserved

- **WHEN** a PUT request sends a `connectionConfig.uri` containing `********` as the password portion
- **THEN** the server retains the existing stored URI
