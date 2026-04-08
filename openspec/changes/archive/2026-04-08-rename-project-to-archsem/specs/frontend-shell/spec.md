## MODIFIED Requirements

### Requirement: App Shell Layout

The frontend SHALL render a sidebar-based app shell with a fixed left sidebar and a main content area. The sidebar SHALL contain (top to bottom): the Archsem logo, a project selector, navigation menu items, and a user profile menu.

#### Scenario: Authenticated user sees sidebar shell

- **WHEN** an authenticated user navigates to any project-scoped route
- **THEN** the sidebar is rendered on the left
- **AND** the main content area fills the remaining space
- **AND** the Archsem logo is displayed at the top of the sidebar
- **AND** the browser tab title reads "Archsem"

#### Scenario: Unauthenticated user is redirected

- **WHEN** an unauthenticated user navigates to any route
- **THEN** they are redirected to the login page
- **AND** the login page displays "Archsem" as the product title
