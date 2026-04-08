## MODIFIED Requirements

### Requirement: Admin User Seeding

The system SHALL seed an admin user at startup using the `UI_USERNAME` and `UI_PASSWORD` environment variables. The admin user is created with email `admin@archsem.local` and a hashed password credential. If the user already exists, seeding is skipped.

#### Scenario: First startup seeds admin

- **WHEN** the API starts and no admin user exists
- **THEN** a user with `UI_USERNAME` as name/username and `admin@archsem.local` as email is created
- **AND** a hashed credential is created from `UI_PASSWORD`

#### Scenario: Subsequent startup skips seeding

- **WHEN** the API starts and the admin user already exists with a credential
- **THEN** no user creation occurs
