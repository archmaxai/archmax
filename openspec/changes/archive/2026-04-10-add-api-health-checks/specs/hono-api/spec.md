## MODIFIED Requirements

### Requirement: Health Endpoint

The API SHALL expose a `GET /api/health` endpoint that probes system dependencies and returns a structured JSON response. This endpoint SHALL NOT require authentication.

The response body SHALL contain:
- `status` — one of `"healthy"` or `"unhealthy"`
- `checks` — an object with per-component results for `mongodb`, `redis`, `env`, and `dataDir`
- `timestamp` — ISO 8601 timestamp of the check

The endpoint SHALL return HTTP 200 when `status` is `"healthy"` and HTTP 503 when `status` is `"unhealthy"`. Any single check failure SHALL result in `"unhealthy"`.

**Checks** (all critical — any failure → `unhealthy`):
- MongoDB connectivity (`ping` command)
- Redis connectivity (`PING` command)
- Required environment variables (`BETTER_AUTH_SECRET`, `UI_PASSWORD`)
- Data directory writability (`ARCHMAX_DATA_DIR`)

Each individual probe SHALL time out within 2 seconds. All probes SHALL run concurrently.

#### Scenario: All systems healthy

- **WHEN** a GET request is made to `/api/health` without a session cookie
- **AND** MongoDB is reachable, Redis is reachable, env vars are valid, and data dir is writable
- **THEN** the response status is 200
- **AND** the body contains `{ "status": "healthy", "checks": { ... }, "timestamp": "..." }`

#### Scenario: MongoDB is unreachable

- **WHEN** a GET request is made to `/api/health`
- **AND** the MongoDB ping fails or times out
- **THEN** the response status is 503
- **AND** `status` is `"unhealthy"`
- **AND** `checks.mongodb.status` is `"down"`

#### Scenario: Redis is unreachable

- **WHEN** a GET request is made to `/api/health`
- **AND** the Redis PING fails or times out
- **THEN** the response status is 503
- **AND** `status` is `"unhealthy"`
- **AND** `checks.redis.status` is `"down"`

#### Scenario: Data directory is not writable

- **WHEN** a GET request is made to `/api/health`
- **AND** the data directory cannot be written to
- **THEN** the response status is 503
- **AND** `status` is `"unhealthy"`
- **AND** `checks.dataDir.status` is `"error"`

#### Scenario: Required env var is missing

- **WHEN** a GET request is made to `/api/health`
- **AND** a required environment variable is not set
- **THEN** the response status is 503
- **AND** `status` is `"unhealthy"`
- **AND** `checks.env.status` is `"missing"`
