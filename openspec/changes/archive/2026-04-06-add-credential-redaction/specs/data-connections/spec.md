## ADDED Requirements

### Requirement: Credential Redaction
All connection API responses SHALL redact sensitive credential fields before returning data to clients. The `password` field in `connectionConfig` SHALL be replaced with a sentinel value (`••••••••`). If `connectionConfig.uri` contains an embedded password, the password portion SHALL be replaced with the same sentinel. This applies to every endpoint that returns connection data: list, get, create, and update.

#### Scenario: GET list redacts passwords
- **WHEN** a GET request is made to `/api/projects/:projectId/connections`
- **THEN** every connection in the response has `connectionConfig.password` replaced with `••••••••`
- **AND** any embedded password in `connectionConfig.uri` is replaced with `••••••••`

#### Scenario: POST create redacts response
- **WHEN** a POST request creates a new connection with a plaintext password
- **THEN** the 201 response body has `connectionConfig.password` replaced with `••••••••`

#### Scenario: PUT update redacts response
- **WHEN** a PUT request updates an existing connection
- **THEN** the response body has `connectionConfig.password` replaced with `••••••••`

### Requirement: Credential Preservation on Update
The PUT endpoint SHALL preserve stored credentials when the client sends back redacted values. If the incoming `connectionConfig.password` equals the sentinel value (`••••••••`) or is empty/absent, the server SHALL keep the previously stored password. If the incoming `connectionConfig.uri` contains the sentinel in its password portion, the server SHALL keep the previously stored URI. This prevents accidental overwrite of credentials with redacted placeholders.

#### Scenario: Sentinel password is preserved
- **WHEN** a PUT request sends `connectionConfig.password` as `••••••••`
- **THEN** the server retains the existing stored password and does not overwrite it with the sentinel

#### Scenario: Empty password is preserved
- **WHEN** a PUT request sends `connectionConfig.password` as an empty string or omits it entirely
- **THEN** the server retains the existing stored password

#### Scenario: New password overwrites stored value
- **WHEN** a PUT request sends a `connectionConfig.password` that is neither empty nor the sentinel
- **THEN** the server updates the stored password to the new value

#### Scenario: Sentinel in URI is preserved
- **WHEN** a PUT request sends a `connectionConfig.uri` containing `••••••••` as the password portion
- **THEN** the server retains the existing stored URI
