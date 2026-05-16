## MODIFIED Requirements

### Requirement: Admin User Seeding

The system SHALL reconcile the admin user and its password against the `UI_USERNAME` and `UI_PASSWORD` environment variables on every API startup. The admin user is identified by the email `admin@archmax.local`.

- If no user with that email exists, the system SHALL create one with `UI_USERNAME` as the name and username, and SHALL create a `credential` account whose stored hash is derived from the current `UI_PASSWORD`.
- If the user exists but has no `credential` account, the system SHALL create the missing credential using the current `UI_PASSWORD`.
- If the user exists and already has a `credential` account, the system SHALL verify the stored password hash against the current `UI_PASSWORD`. If verification fails, the stored hash SHALL be replaced with a fresh hash of the current `UI_PASSWORD` and the change SHALL be logged. If verification succeeds, no write SHALL occur.

Because `UI_PASSWORD` is required by environment validation (minimum 8 characters), this reconciliation makes `UI_PASSWORD` the authoritative source of the admin password on every startup. Any password change made via the admin UI that differs from `UI_PASSWORD` will be overwritten on the next API restart.

#### Scenario: First startup seeds admin

- **WHEN** the API starts and no admin user exists
- **THEN** a user with `UI_USERNAME` as name/username and `admin@archmax.local` as email is created
- **AND** a `credential` account is created whose hash is derived from the current `UI_PASSWORD`

#### Scenario: Subsequent startup with matching password is a no-op

- **WHEN** the API starts and the admin user already exists with a `credential` account whose stored hash matches the current `UI_PASSWORD`
- **THEN** no user, account, or password write occurs

#### Scenario: Subsequent startup with changed UI_PASSWORD resets the password

- **WHEN** the API starts and the admin user already exists with a `credential` account whose stored hash does not match the current `UI_PASSWORD`
- **THEN** the stored credential hash is replaced with a fresh hash of the current `UI_PASSWORD`
- **AND** a log line indicates that the admin password was reset from the `UI_PASSWORD` environment variable
- **AND** logging in with the previous password fails while logging in with the current `UI_PASSWORD` succeeds

#### Scenario: Existing user without credential gets one

- **WHEN** the API starts and the admin user exists but has no `credential` account
- **THEN** a `credential` account is created using the current `UI_PASSWORD`
