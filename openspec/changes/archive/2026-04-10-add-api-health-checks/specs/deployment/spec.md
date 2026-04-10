## ADDED Requirements

### Requirement: Docker Health Check

The Dockerfile SHALL include a `HEALTHCHECK` instruction that probes the API health endpoint to provide native container health status to Docker and orchestrators.

The `HEALTHCHECK` SHALL:
- Use `curl -sf http://127.0.0.1:3000/api/health` to hit the API directly (bypassing nginx)
- Poll every 30 seconds with a 5-second timeout
- Allow a 15-second start period for embedded services (MongoDB, Redis) to boot
- Retry 3 times before marking the container as unhealthy

#### Scenario: Container reports healthy after startup

- **WHEN** the container starts and all services (API, MongoDB, Redis) are ready
- **AND** the Docker health check runs after the start period
- **THEN** `docker inspect` shows the container health as `healthy`

#### Scenario: Container reports unhealthy when API is down

- **WHEN** the API process crashes or MongoDB becomes unreachable
- **AND** the health endpoint returns HTTP 503 or is unreachable
- **THEN** after 3 consecutive failed checks, `docker inspect` shows the container health as `unhealthy`
