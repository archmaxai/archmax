# auth Specification

## Purpose
Authentication and session management for the admin UI, using Better Auth with username/password login, session cookies, and route guarding on both server and client.
## Requirements
### Requirement: Better Auth Integration

The API SHALL use Better Auth with the `username` plugin and MongoDB adapter for authentication. All Better Auth routes SHALL be mounted at `/api/auth/**` and delegated to the Better Auth handler. The `BETTER_AUTH_SECRET` environment variable SHALL be used for signing sessions. Session cookies SHALL be configured with `httpOnly: true`, `sameSite: "lax"`, and `secure: true` when `NODE_ENV` is `"production"`. The `UI_PASSWORD` environment variable SHALL require a minimum length of 8 characters.

#### Scenario: Better Auth handles auth routes

- **WHEN** a request is made to any `/api/auth/**` path
- **THEN** it is delegated to the Better Auth handler
- **AND** Better Auth manages session creation, validation, and cookie handling

#### Scenario: Session cookie attributes in production

- **WHEN** the API is running in production (`NODE_ENV=production`)
- **THEN** session cookies include `HttpOnly`, `Secure`, and `SameSite=Lax` attributes

#### Scenario: UI_PASSWORD below minimum length

- **WHEN** the API starts with `UI_PASSWORD` shorter than 8 characters
- **THEN** environment validation fails with an error indicating the minimum password length

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

### Requirement: Session-Based Auth Middleware

All `/api/*` routes (except `/api/health` and `/api/auth/**`) SHALL require a valid session. The middleware calls `auth.api.getSession()` and returns 401 if no valid session is found.

#### Scenario: Valid session allows access

- **WHEN** a request to `/api/projects` includes a valid session cookie
- **THEN** the request proceeds to the route handler

#### Scenario: Missing session returns 401

- **WHEN** a request to `/api/projects` has no session cookie
- **THEN** a 401 response is returned

#### Scenario: Health endpoint is public

- **WHEN** a GET request is made to `/api/health`
- **THEN** the response is 200 regardless of session state

### Requirement: Login Page

The frontend SHALL provide a `/login` route with a username and password form. On submit, it calls `authClient.signIn.username()`. On success, the user is redirected to `/`. On failure, an error message is displayed.

#### Scenario: Successful login redirects to dashboard

- **WHEN** the user submits valid credentials on the login page
- **THEN** the browser is redirected to `/`

#### Scenario: Invalid credentials show error

- **WHEN** the user submits invalid credentials on the login page
- **THEN** an error message is displayed on the login form
- **AND** the user remains on the login page

### Requirement: Auth-Guarded Routes

All admin routes SHALL be wrapped in an `_auth` layout route. The layout's `beforeLoad` hook calls `authClient.getSession()` and redirects to `/login` if no session exists.

#### Scenario: Unauthenticated user is redirected

- **WHEN** an unauthenticated user navigates to any admin route
- **THEN** they are redirected to `/login`

#### Scenario: Authenticated user accesses admin routes

- **WHEN** an authenticated user navigates to any admin route
- **THEN** the layout renders the sidebar shell and outlet

### Requirement: Logout

The user profile menu in the sidebar SHALL include a sign-out option. Clicking it calls `authClient.signOut()`, which terminates the session and redirects to `/login`.

#### Scenario: User logs out

- **WHEN** the user clicks "Sign out" in the profile dropdown
- **THEN** the session is terminated via Better Auth
- **AND** the browser is redirected to `/login`

### Requirement: GitHub OAuth Constant-Time State Verification

The GitHub OAuth state parameter verification SHALL use `crypto.timingSafeEqual()` for HMAC signature comparison to prevent timing side-channel attacks. The signature length check and comparison SHALL both use constant-time operations.

#### Scenario: Timing-safe HMAC comparison

- **WHEN** a GitHub OAuth callback includes a state parameter
- **THEN** the HMAC signature is verified using `crypto.timingSafeEqual()`
- **AND** the comparison does not leak timing information about the expected signature

#### Scenario: Invalid signature rejected

- **WHEN** a GitHub OAuth callback includes a state parameter with an invalid HMAC
- **THEN** a 400 error is returned indicating an invalid state signature

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

