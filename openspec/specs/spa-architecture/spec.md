# spa-architecture Specification

## Purpose
The single-page application frontend built on Vite, React 19, TanStack Router, and Tailwind CSS 4. Provides the admin UI for managing semantic layer configurations.

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

The frontend SHALL consume UI components from the `@semlayer/ui` package, which exports Radix-based primitives with CVA variants.

#### Scenario: Button component renders correctly

- **WHEN** a `<Button variant="outline">` is rendered
- **THEN** it applies the outline variant classes from the CVA definition

### Requirement: Typed API Client

The frontend SHALL use `hc<AppType>` from `hono/client` for type-safe API calls, with Vite's dev server proxying `/api/` to the backend.

#### Scenario: API call returns typed response

- **WHEN** the frontend calls `api.api["data-sources"].$get()`
- **THEN** the response type matches the backend route's return type

### Requirement: Geist Fonts

The frontend SHALL use Geist Sans and Geist Mono variable fonts loaded via `@font-face` from local woff2 files.

#### Scenario: Fonts load correctly

- **WHEN** the page loads
- **THEN** body text uses Geist Sans
- **AND** monospace elements use Geist Mono
