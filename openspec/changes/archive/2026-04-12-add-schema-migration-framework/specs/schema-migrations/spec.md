## ADDED Requirements

### Requirement: Per-Document Schema Version

Every Mongoose model SHALL include a `_schemaVersion` integer field (default `0`) stored on each document. New documents SHALL be created with `_schemaVersion` set to the latest migration version for that model. Existing documents without `_schemaVersion` are treated as version `0`. This field enables the migration runner to identify and upgrade outdated documents.

#### Scenario: New document gets current version

- **WHEN** a new Connection document is created after migration version 1 is registered
- **THEN** the document is stored with `_schemaVersion: 1`

#### Scenario: Legacy document has version 0

- **WHEN** a document exists in MongoDB without a `_schemaVersion` field
- **THEN** the migration runner treats it as `_schemaVersion: 0`
- **AND** it is eligible for all migrations starting from version 1

### Requirement: Migration Runner

The system SHALL provide a `runMigrations()` function that executes pending database migrations at startup. The runner SHALL:
- Load all registered migrations from a central registry, grouped by model
- For each model, determine the target version (highest registered migration version)
- Query for documents where `_schemaVersion` is less than the target version
- Execute migrations in ascending version order, updating `_schemaVersion` on each document after successful migration
- Log each migration's model, version, and description as it runs
- Log a summary of how many documents were migrated per model

The runner SHALL be safe to call from multiple processes: since each document's `_schemaVersion` is updated atomically after migration, concurrent runners will not corrupt data.

#### Scenario: Startup with outdated documents

- **WHEN** `runMigrations()` runs and 5 Connection documents have `_schemaVersion: 0`
- **AND** the target version for Connection is 1
- **THEN** migration version 1 is applied to all 5 documents
- **AND** each document's `_schemaVersion` is updated to 1
- **AND** the log shows "Migrated 5 Connection documents to v1"

#### Scenario: Startup with all documents current

- **WHEN** `runMigrations()` runs and all Connection documents have `_schemaVersion: 1`
- **AND** the target version for Connection is 1
- **THEN** no migration work is performed
- **AND** no migration log output is produced for that model

#### Scenario: Migration failure on individual document

- **WHEN** a migration fails on a specific document
- **THEN** that document's `_schemaVersion` is NOT updated
- **AND** the error is logged with the document ID
- **AND** the runner continues processing remaining documents

### Requirement: Migration Script Interface

Each migration script SHALL export an object with: `model` (string matching a Mongoose model name), `version` (positive integer, unique per model), `description` (human-readable string), and `up` (async function that receives a document and performs the migration). Migrations SHALL be idempotent: running a migration on already-migrated data SHALL have no effect.

#### Scenario: Idempotent migration execution

- **WHEN** migration version 1 for Connection processes a document whose `connectionConfig.password` is already encrypted
- **THEN** the password is left unchanged
- **AND** `_schemaVersion` is set to 1

### Requirement: Connection Credential Encryption Migration

The system SHALL include a migration (model `Connection`, version 1) that encrypts existing plaintext `connectionConfig.password` and `connectionConfig.uri` fields. When `ENCRYPTION_KEY` is not configured, the migration SHALL skip encryption, log a warning, and still set `_schemaVersion` to 1 (so documents are not re-processed on every startup). The migration SHALL detect already-encrypted values (hex-encoded AES-256-GCM ciphertext) and skip them.

#### Scenario: Encrypt plaintext credentials

- **WHEN** the migration runs with `ENCRYPTION_KEY` set
- **AND** a Connection document has `connectionConfig.password: "s3cret"` (plaintext) and `_schemaVersion: 0`
- **THEN** the password is encrypted with AES-256-GCM and the document is updated with `_schemaVersion: 1`

#### Scenario: Skip already-encrypted credentials

- **WHEN** the migration runs with `ENCRYPTION_KEY` set
- **AND** a Connection document has `connectionConfig.password` that is already hex-encoded ciphertext
- **THEN** the password is left unchanged and `_schemaVersion` is set to 1

#### Scenario: Skip encryption when ENCRYPTION_KEY is absent

- **WHEN** the migration runs without `ENCRYPTION_KEY` configured
- **THEN** no Connection credentials are modified
- **AND** a warning is logged: "ENCRYPTION_KEY not set, skipping credential encryption"
- **AND** `_schemaVersion` is still set to 1 on all outdated documents
