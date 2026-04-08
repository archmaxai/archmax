# auth Specification

## Purpose
Authentication and session management for the admin UI, using Better Auth with username/password login, session cookies, and route guarding on both server and client.

## Requirements

### Requirement: Better Auth Integration

The API SHALL use Better Auth with the `username` plugin and MongoDB adapter for authentication. All Better Auth routes SHALL be mounted at `/api/auth/**` and delegated to the Better Auth handler. The `BETTER_AUTH_SECRET` environment variable SHALL be used for signing sessions.

#### Scenario: Better Auth handles auth routes

- **WHEN** a request is made to any `/api/auth/**` path
- **THEN** it is delegated to the Better Auth handler
- **AND** Better Auth manages session creation, validation, and cookie handling

### Requirement: Admin User Seeding

The system SHALL seed an admin user at startup using the `UI_USERNAME` and `UI_PASSWORD` environment variables. The admin user is created with email `admin@semlayer.local` and a hashed password credential. If the user already exists, seeding is skipped.

#### Scenario: First startup seeds admin

- **WHEN** the API starts and no admin user exists
- **THEN** a user with `UI_USERNAME` as name/username and `admin@semlayer.local` as email is created
- **AND** a hashed credential is created from `UI_PASSWORD`

#### Scenario: Subsequent startup skips seeding

- **WHEN** the API starts and the admin user already exists with a credential
- **THEN** no user creation occurs

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
