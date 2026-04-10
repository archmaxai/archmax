## MODIFIED Requirements

### Requirement: Better Auth Integration

The API SHALL use Better Auth with the `username` plugin and MongoDB adapter for authentication. All Better Auth routes SHALL be mounted at `/api/auth/**` and delegated to the Better Auth handler. The `BETTER_AUTH_SECRET` environment variable SHALL be used for signing sessions. Session cookies SHALL be configured with `httpOnly: true`, `sameSite: "lax"`, and `secure: true` when `NODE_ENV` is `"production"`. The `UI_PASSWORD` environment variable SHALL require a minimum length of 8 characters.

#### Scenario: Better Auth handles auth routes

- **WHEN** a request is made to any `/api/auth/**` path
- **THEN** it is delegated to the Better Auth handler
- **AND** Better Auth manages session creation, validation, and cookie handling

#### Scenario: Session cookie attributes in production

- **WHEN** the API is running in production (`NODE_ENV=production`)
- **THEN** session cookies include `HttpOnly`, `Secure`, and `SameSite=Lax` attributes

#### Scenario: UI_PASSWORD below minimum length

- **WHEN** the API starts with `UI_PASSWORD` shorter than 8 characters
- **THEN** environment validation fails with an error indicating the minimum password length

## ADDED Requirements

### Requirement: GitHub OAuth Constant-Time State Verification

The GitHub OAuth state parameter verification SHALL use `crypto.timingSafeEqual()` for HMAC signature comparison to prevent timing side-channel attacks. The signature length check and comparison SHALL both use constant-time operations.

#### Scenario: Timing-safe HMAC comparison

- **WHEN** a GitHub OAuth callback includes a state parameter
- **THEN** the HMAC signature is verified using `crypto.timingSafeEqual()`
- **AND** the comparison does not leak timing information about the expected signature

#### Scenario: Invalid signature rejected

- **WHEN** a GitHub OAuth callback includes a state parameter with an invalid HMAC
- **THEN** a 400 error is returned indicating an invalid state signature
