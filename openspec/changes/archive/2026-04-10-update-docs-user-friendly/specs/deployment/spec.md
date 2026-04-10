## MODIFIED Requirements

### Requirement: Deployment Documentation

The documentation site SHALL provide comprehensive deployment guidance across multiple pages:

**Installation page** (`getting-started/installation`):
- The primary quick start MUST use `docker compose up` with the repository-root `docker-compose.yml`, requiring `BETTER_AUTH_SECRET`, `UI_PASSWORD`, and optionally `AGENT_API_KEY`.
- A `docker run` section MUST document the standalone approach, noting that only `BETTER_AUTH_SECRET` and `UI_PASSWORD` are required (MongoDB and Redis are embedded automatically).
- A clear note MUST explain that MongoDB is embedded automatically when `MONGODB_URI` is omitted, and Redis is embedded automatically when `REDIS_URL` is omitted.
- Both sections MUST include `UI_USERNAME` (default: `admin`) in the environment variable list so users know their login credentials.
- A prominent warning MUST advise users to save their `BETTER_AUTH_SECRET` value persistently. The warning MUST explain that losing or changing this secret invalidates all sessions and authentication data.
- After the deployment steps, a "Log in" step MUST tell users to open the URL and authenticate with `UI_USERNAME` / `UI_PASSWORD`.

**Configuration reference** (`reference/configuration`):
- `MONGODB_URI` MUST be documented as optional with a note that the Docker image embeds MongoDB when unset.
- A "Data Directory" section MUST document the `/app/data/` layout (`projects/`, `mongodb/`) and the single-volume backup strategy.
- `REDIS_URL` MUST include a note that the Docker image embeds Redis when unset.
- `UI_USERNAME` MUST be listed alongside `UI_PASSWORD` in the Admin Credentials section with its default value (`admin`).

**Self-hosting guide** (`guides/self-hosting`):
- A dedicated page MUST cover deployment modes (Docker Compose as recommended for production, standalone `docker run` with embedded services for simple setups).
- Each deployment mode MUST include a brief explanation of when to use it and what trade-offs it carries (e.g., standalone is simpler but embeds MongoDB in the same container; Compose separates concerns and is easier to back up and scale).
- Data backup instructions MUST explain how to back up the `/app/data` volume (covering both project files and embedded MongoDB data) and external MongoDB data separately when using Compose.
- The page MUST be linked in the documentation sidebar.

**README Quick Start**:
- The `docker run` example MUST show `UI_USERNAME` alongside the other environment variables.
- A note after the command MUST tell users to save their `BETTER_AUTH_SECRET`.
- The "Open and log in" step MUST reference both `UI_USERNAME` and `UI_PASSWORD`.

**.env.example**:
- `MONGODB_URI` MUST be commented out and marked as optional (not "Required"), since the Docker image embeds MongoDB when unset.

#### Scenario: User follows Compose quickstart

- **WHEN** a new user reads the installation documentation
- **THEN** they find `docker compose up` as the primary quick-start method
- **AND** the guide shows how to set required environment variables
- **AND** MongoDB is listed as provided by the Compose stack (not embedded)

#### Scenario: User follows standalone docker run

- **WHEN** a user reads the standalone Docker section
- **THEN** they find a `docker run` command listing only `BETTER_AUTH_SECRET` and `UI_PASSWORD` as required
- **AND** a note explains that `MONGODB_URI` and `REDIS_URL` are optional (embedded fallbacks available)

#### Scenario: User looks up MONGODB_URI in configuration reference

- **WHEN** a user reads the configuration reference
- **THEN** `MONGODB_URI` is listed as optional
- **AND** a note explains that the Docker image embeds MongoDB when unset

#### Scenario: User needs to back up data

- **WHEN** a user reads the self-hosting guide
- **THEN** they find instructions for backing up the `/app/data` volume (semantic models and embedded MongoDB)
- **AND** separate guidance for backing up external MongoDB data via the Compose volume or managed service

#### Scenario: User knows login credentials after deployment

- **WHEN** a user finishes the Docker deployment steps on any docs page
- **THEN** they are told to log in with the username (`UI_USERNAME`, default `admin`) and the password they set via `UI_PASSWORD`

#### Scenario: User is warned about BETTER_AUTH_SECRET persistence

- **WHEN** a user reads any deployment instructions (README, installation, Docker reference)
- **THEN** they find a warning to save their `BETTER_AUTH_SECRET` and reuse it across restarts and upgrades
