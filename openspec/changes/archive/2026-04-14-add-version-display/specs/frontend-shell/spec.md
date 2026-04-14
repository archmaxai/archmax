## MODIFIED Requirements

### Requirement: App Shell Layout

The frontend SHALL render a sidebar-based app shell with a fixed left sidebar and a main content area. The sidebar SHALL contain (top to bottom): the archmax logo with a version badge, a project selector, navigation menu items, and a user profile menu.

The version badge SHALL display the application version (e.g., `v0.3.1`) as a small pill-shaped tag immediately to the right of the "archmax" brand text. The badge SHALL use muted styling (small font size, rounded-full, low-contrast background) to avoid competing with the brand text. The badge SHALL be hidden when the sidebar is collapsed.

The version string SHALL be fetched at runtime from the authenticated `GET /api/version` endpoint. The query SHALL use `staleTime: Infinity` so the version is fetched once per session. If the fetch fails or the version is not available, the badge SHALL not be rendered.

#### Scenario: Authenticated user sees sidebar shell

- **WHEN** an authenticated user navigates to any project-scoped route
- **THEN** the sidebar is rendered on the left
- **AND** the main content area fills the remaining space
- **AND** the archmax logo is displayed at the top of the sidebar with a version badge to its right
- **AND** the browser tab title reads "archmax"

#### Scenario: Unauthenticated user is redirected

- **WHEN** an unauthenticated user navigates to any route
- **THEN** they are redirected to the login page
- **AND** the login page displays "archmax" as the product title

#### Scenario: Version badge shows release version

- **WHEN** the backend reports version `0.4.0` from the authenticated endpoint
- **THEN** the sidebar displays a badge reading "v0.4.0" next to the "archmax" text

#### Scenario: Version badge hidden when sidebar collapsed

- **WHEN** the sidebar is in collapsed state
- **THEN** the version badge is not visible

#### Scenario: Version badge not shown when fetch fails

- **WHEN** the version endpoint returns an error
- **THEN** the sidebar displays "archmax" without a version badge
