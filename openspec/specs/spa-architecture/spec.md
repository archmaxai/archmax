# spa-architecture Specification

## Purpose
The single-page application frontend built on Vite, React 19, TanStack Router, and Tailwind CSS 4. Provides the foundational infrastructure for the admin UI. Auth-specific behavior (login page, route guarding, logout) is covered in the `auth` spec.
## Requirements
### Requirement: Vite SPA Entry

The frontend SHALL be a Vite-powered React SPA with `index.html` as the entry point and TanStack Router for file-based routing.

#### Scenario: App renders root layout

- **WHEN** the user navigates to any route
- **THEN** the root layout renders with a full-screen container
- **AND** child routes are rendered via `<Outlet />`

### Requirement: Tailwind Design Tokens

The frontend SHALL use Tailwind CSS 4 with OKLCH color tokens for light and dark themes, defined in `globals.css`.

#### Scenario: Dark mode applies correct tokens

- **WHEN** the `<html>` element has the `dark` class
- **THEN** all CSS custom properties switch to dark theme values

### Requirement: Shared UI Components

The frontend SHALL consume UI components from the `@archsem/ui` package, which exports Radix-based primitives with CVA variants.

#### Scenario: Button component renders correctly

- **WHEN** a `<Button variant="outline">` is rendered
- **THEN** it applies the outline variant classes from the CVA definition

### Requirement: Typed API Client

The frontend SHALL use `hc<AppType>` from `hono/client` for type-safe API calls, with Vite's dev server proxying `/api/` to the backend.

#### Scenario: API call returns typed response

- **WHEN** the frontend calls an API endpoint via the typed client
- **THEN** the response type matches the backend route's return type

### Requirement: Geist Fonts

The frontend SHALL use Geist Sans and Geist Mono variable fonts loaded via `@font-face` from local woff2 files.

#### Scenario: Fonts load correctly

- **WHEN** the page loads
- **THEN** body text uses Geist Sans
- **AND** monospace elements use Geist Mono

### Requirement: Periodic Data Polling
The frontend SHALL periodically refetch dynamic data using TanStack Query's `refetchInterval` option. Each query SHALL define its polling interval inline, colocated with its query configuration. No shared polling config module is required.

The following queries SHALL poll at regular intervals:
- **Projects list** (`["projects"]`) — 30 seconds
- **Single project** (`["project", projectId]`) — 30 seconds
- **Connections list** (`["connections", projectId]`) — 30 seconds
- **Semantic models list** (`["semantic-models", projectId]`) — 10 seconds
- **Conversations list** (`["conversations", projectId]`) — 10 seconds
- **Single conversation** (`["conversation", conversationId]`) — 10 seconds

Semantic models and conversations use a shorter interval because they change frequently during active agent sessions (file writes, async title generation).

#### Scenario: Conversation title appears after async generation
- **WHEN** the user starts a new conversation and the title is generated asynchronously
- **THEN** the conversations list updates to show the generated title within the polling interval
- **AND** no manual refresh is required

#### Scenario: Semantic model changes reflected during agent session
- **WHEN** the AI agent writes or modifies a semantic model YAML file
- **THEN** the semantic models list in the explorer updates within the polling interval
- **AND** the user sees the changes without navigating away

#### Scenario: New project appears in selector
- **WHEN** a project is created in another tab or session
- **THEN** the project selector dropdown includes the new project within the polling interval

#### Scenario: Connection status updates
- **WHEN** a connection is created or modified outside the current view
- **THEN** the connections list reflects the change within the polling interval

