## ADDED Requirements

### Requirement: Login Page

The frontend SHALL provide a `/login` route with a username and password form. On successful login, the user SHALL be redirected to the dashboard. On failure, an error message SHALL be displayed.

#### Scenario: Successful login redirects to dashboard

- **WHEN** the user submits valid credentials on the login page
- **THEN** the browser is redirected to `/`
- **AND** the dashboard loads with data

#### Scenario: Invalid credentials show error

- **WHEN** the user submits invalid credentials on the login page
- **THEN** an error message is displayed on the login form
- **AND** the user remains on the login page

### Requirement: Auth-Guarded Routes

All admin routes (dashboard, future settings pages) SHALL be wrapped in an auth-guarded layout route. If the user is not authenticated, they SHALL be redirected to `/login`.

#### Scenario: Unauthenticated user is redirected

- **WHEN** an unauthenticated user navigates to `/`
- **THEN** they are redirected to `/login`

#### Scenario: Authenticated user accesses admin routes

- **WHEN** an authenticated user navigates to `/`
- **THEN** the dashboard renders normally

### Requirement: Logout

The dashboard header SHALL include a logout button. Clicking it SHALL call `POST /api/auth/logout`, clear the session, and redirect to `/login`.

#### Scenario: User logs out

- **WHEN** the user clicks the logout button
- **THEN** the session is cleared on the server
- **AND** the browser is redirected to `/login`
