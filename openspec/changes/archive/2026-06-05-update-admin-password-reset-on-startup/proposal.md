# Change: Reset admin password on every startup when UI_PASSWORD is set

## Why

Today `seedAdmin()` (`apps/api/src/lib/seed-admin.ts:10-21`) only writes a credential when no admin user exists yet. Once seeded, changing `UI_PASSWORD` in the environment and restarting has no effect — the env var silently becomes inert. Operators reasonably expect `UI_PASSWORD` to be the source of truth for the admin password (it is the only documented way to bootstrap and recover access in a single-user deployment), and there is no in-product password recovery flow if the in-UI password change is forgotten or the previous secret is lost.

## What Changes

- Update the admin seeding routine to reconcile the admin credential on every startup whenever `UI_PASSWORD` is set: if the stored credential's hash does not already verify the current `UI_PASSWORD`, replace it with a fresh hash of the current `UI_PASSWORD`. **BREAKING (operational)**: a password the admin previously changed via the UI will be overwritten on the next API restart whenever it differs from `UI_PASSWORD`.
- When the stored credential already matches the current `UI_PASSWORD`, do nothing (no log spam, no unnecessary writes).
- Continue to create the admin user from scratch when it does not yet exist (existing first-startup behavior is preserved).
- Update the `auth` capability spec ("Admin User Seeding") to reflect the new reconciliation contract and add scenarios for the unchanged / changed / missing-user cases.
- Update user-facing docs that currently describe `UI_PASSWORD` as "initial" or "seed only" to clarify it is authoritative on every startup, and call out the operational trade-off (UI password changes are not durable across restarts unless `UI_PASSWORD` is updated to match).

## Impact

- Affected specs: `auth` (modifies `Admin User Seeding`).
- Affected code:
  - `apps/api/src/lib/seed-admin.ts` — replace the "skip if credential exists" branch with a reconciliation step using `ctx.password.verify` + `ctx.internalAdapter.updatePassword` (or equivalent Better Auth credential update API).
  - `apps/api/src/lib/seed-admin.test.ts` (new) — unit coverage for the three branches: missing user, credential matches, credential differs.
- Affected docs:
  - `apps/docs/src/content/docs/reference/configuration.mdx` — drop "initial" wording from the `UI_PASSWORD` row; note that the value is reapplied on every restart.
  - `apps/docs/src/content/docs/reference/docker.mdx` — same wording fix for `UI_PASSWORD` rows; mention the rotation-by-restart behavior.
  - `apps/docs/src/content/docs/guides/self-hosting.mdx` — clarify how to rotate the admin password (update `UI_PASSWORD`, restart the container) and warn that UI password changes are not durable.
  - `README.md` — drop "Initial" qualifier from the `UI_PASSWORD` description in the env-vars table.
- Operational impact:
  - Operators relying on UI-side password rotation will need to keep `UI_PASSWORD` in sync (or accept that UI changes do not survive restarts). This is documented in the docs updates above.
  - No data migration required — the existing credential row is updated in place.
