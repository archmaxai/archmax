# Change: Add credential redaction to all API responses

## Why
Connection passwords and URI credentials are returned in plaintext from POST (create) and PUT (update) API responses. Only GET endpoints currently redact. This means every create/update round-trip leaks secrets to the browser, where they appear in network inspector, JS memory, and React devtools.

## What Changes
- **API**: All connection API responses (GET, POST, PUT) SHALL redact `password` and URI credentials before returning to the client
- **API**: PUT endpoint SHALL preserve stored credentials when the incoming payload contains the redaction sentinel (`••••••••`) or omits the password field entirely — preventing accidental overwrite
- **Frontend**: Password field is write-only; the `Connection` response type drops `password` from `connectionConfig`
- **Frontend**: Edit form sends password only when the user explicitly enters a new value

## Impact
- Affected specs: `data-connections`, `connection-management-ui`
- Affected code: `apps/api/src/routes/connections.ts`, `apps/frontend/src/routes/_auth/$projectId/connections.tsx`
- **BREAKING**: The POST and PUT JSON responses will no longer include `connectionConfig.password` in cleartext (replaced with sentinel). Existing frontend already ignores it in list/edit views, so no visible regression.
