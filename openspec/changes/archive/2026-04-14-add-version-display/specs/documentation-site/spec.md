## ADDED Requirements

### Requirement: Version Badge in Docs Header

The documentation site SHALL display a version badge next to the logo in the Starlight navbar header. The badge SHALL show the current release version (e.g., `v0.3.1`) in a small pill-shaped tag with muted styling consistent with the site's design tokens.

The version SHALL be injected at build time from the latest git tag. The `docs.yml` GitHub Actions workflow SHALL resolve the latest `v*` tag and pass it as the `APP_VERSION` environment variable to the Astro build. When `APP_VERSION` is not set (local development), the badge SHALL display "dev".

The version badge SHALL be implemented as a custom Starlight component override for `SiteTitle`.

#### Scenario: Docs show current release version

- **WHEN** the docs site is built after release `v0.4.0` and deployed to GitHub Pages
- **THEN** the navbar header displays a badge reading "v0.4.0" next to the archmax logo

#### Scenario: Local docs dev shows fallback

- **WHEN** a developer runs the docs dev server locally without `APP_VERSION` set
- **THEN** the navbar header displays a badge reading "dev" next to the archmax logo

#### Scenario: Badge styling matches site design

- **WHEN** a user views the documentation site
- **THEN** the version badge uses muted colors (gray background, gray text) and pill-shaped rounded corners
- **AND** the badge does not visually compete with the logo or navigation
