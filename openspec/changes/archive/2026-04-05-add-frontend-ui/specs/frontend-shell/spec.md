## ADDED Requirements

### Requirement: App Shell Layout

The frontend SHALL render a sidebar-based app shell with a fixed left sidebar and a main content area. The sidebar SHALL contain (top to bottom): the archmax logo, a project selector, navigation menu items, and a user profile menu.

#### Scenario: Authenticated user sees sidebar shell

- **WHEN** an authenticated user navigates to any project-scoped route
- **THEN** the sidebar is rendered on the left
- **AND** the main content area fills the remaining space
- **AND** the archmax logo is displayed at the top of the sidebar

#### Scenario: Unauthenticated user is redirected

- **WHEN** an unauthenticated user navigates to any route
- **THEN** they are redirected to the login page

### Requirement: Project Selector

The sidebar SHALL display a project selector above the navigation menu. The selector shows the currently active project name and allows switching between projects via a dropdown. A "+" button next to the selector SHALL open a dialog to create a new project.

#### Scenario: Switch project

- **WHEN** the user selects a different project from the dropdown
- **THEN** the URL updates to `/<newProjectId>/connections`
- **AND** all content reloads for the new project context

#### Scenario: Create project via selector

- **WHEN** the user clicks the "+" button in the project selector
- **THEN** a dialog opens for entering project title and description
- **AND** on submission, the new project is created via the API
- **AND** the user is navigated to the new project

#### Scenario: No projects exist

- **WHEN** the user has no projects
- **THEN** the project selector shows a prompt to create the first project

### Requirement: Sidebar Navigation

The sidebar SHALL display navigation items below the project selector. Each item has an icon and a label. The items are: Data Connections, Semantic Models, Monitoring, and Settings. The active route is visually highlighted.

#### Scenario: Navigate to Data Connections

- **WHEN** the user clicks the Data Connections nav item
- **THEN** the URL changes to `/<projectId>/connections`
- **AND** the Data Connections item is highlighted as active

#### Scenario: Navigate to Semantic Models

- **WHEN** the user clicks the Semantic Models nav item
- **THEN** the URL changes to `/<projectId>/models`
- **AND** the Semantic Models item is highlighted as active

### Requirement: User Profile Menu

The sidebar SHALL display a user profile menu at the bottom. It shows the user's avatar and name. Clicking it opens a dropdown with theme selection (light/dark/system) and a logout option.

#### Scenario: User logs out via menu

- **WHEN** the user clicks "Sign out" in the profile dropdown
- **THEN** the session is terminated
- **AND** the user is redirected to the login page

#### Scenario: User switches theme

- **WHEN** the user selects a theme option (light, dark, system)
- **THEN** the theme class on the HTML element updates accordingly

### Requirement: Project-Scoped Routing

All main content routes SHALL be scoped under `/$projectId/`. A layout route at `/_auth/$projectId` SHALL fetch the project data and provide it via React context, plus render the sidebar shell.

#### Scenario: Invalid project ID in URL

- **WHEN** the user navigates to a URL with a non-existent project ID
- **THEN** a 404 or redirect to project selection is shown
