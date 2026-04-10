## ADDED Requirements

### Requirement: JSON Content-Type Enforcement

All state-changing `/api/*` routes (POST, PUT, PATCH, DELETE) SHALL reject requests that do not include a `Content-Type: application/json` header (or a multipart content type for file upload endpoints). This prevents cross-site form submissions that bypass CORS preflight. Requests with missing or invalid content types on mutation endpoints SHALL receive a 415 Unsupported Media Type response.

#### Scenario: JSON content type accepted

- **WHEN** a POST request to `/api/projects` includes `Content-Type: application/json`
- **THEN** the request is processed normally

#### Scenario: Form-encoded content type rejected

- **WHEN** a POST request to `/api/projects` includes `Content-Type: application/x-www-form-urlencoded`
- **THEN** a 415 response is returned

#### Scenario: File upload with multipart accepted

- **WHEN** a POST request to a file upload endpoint includes `Content-Type: multipart/form-data`
- **THEN** the request is processed normally

### Requirement: Security Response Headers

All responses served through the nginx reverse proxy SHALL include the following security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. These headers SHALL be set in the nginx configuration and apply to all response paths (API, SPA, static assets).

#### Scenario: Security headers present on API response

- **WHEN** an API response is returned through nginx
- **THEN** the response includes `X-Content-Type-Options: nosniff`
- **AND** the response includes `X-Frame-Options: DENY`
- **AND** the response includes `Referrer-Policy: strict-origin-when-cross-origin`

#### Scenario: Security headers present on SPA response

- **WHEN** the frontend SPA `index.html` is served
- **THEN** all four security headers are present in the response
