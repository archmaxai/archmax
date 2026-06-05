## 1. Implementation

- [x] 1.1 In `apps/api/src/lib/seed-admin.ts`, when the admin user already exists with a `credential` account, verify the stored hash against `env.UI_PASSWORD`; if it does not match, replace the stored hash with a fresh `ctx.password.hash(env.UI_PASSWORD)` via Better Auth's credential update API (e.g. `ctx.internalAdapter.updatePassword`) instead of returning early.
- [x] 1.2 Keep the no-op branch when the stored hash already matches `UI_PASSWORD` (log a single "Admin password already up to date" line at most), and keep the existing "credential missing" and "user missing" branches working unchanged.
- [x] 1.3 Make sure the reconciliation path logs a clear message such as `Admin password reset from UI_PASSWORD env var.` so operators can see in container logs that the env var took effect.

## 2. Tests

- [x] 2.1 Add `apps/api/src/lib/seed-admin.test.ts` covering: (a) user missing → user + credential created; (b) user exists, credential hash matches `UI_PASSWORD` → no write; (c) user exists, credential hash does not match `UI_PASSWORD` → credential updated; (d) user exists without credential → credential created (existing behavior preserved).
- [x] 2.2 Run `pnpm --filter @archmax/api test` and `pnpm typecheck` and ensure both pass.

## 3. Documentation

- [x] 3.1 Update `apps/docs/src/content/docs/reference/configuration.mdx` so the `UI_PASSWORD` row no longer says "Initial admin password" — describe it as the authoritative admin password applied on every startup, and add a short note that changing it and restarting the API is the supported way to rotate the admin password.
- [x] 3.2 Update `apps/docs/src/content/docs/reference/docker.mdx` (both env var tables) with the same wording, and add a note in the troubleshooting/login section that any UI-side password change will be overwritten on restart if it differs from `UI_PASSWORD`.
- [x] 3.3 Update `apps/docs/src/content/docs/guides/self-hosting.mdx` to describe password rotation: bump `UI_PASSWORD`, restart the container, log in with the new value.
- [x] 3.4 Update `README.md` env vars table entry for `UI_USERNAME` / `UI_PASSWORD` to drop the "Initial" qualifier from the password description.

## 4. Validation

- [x] 4.1 Run `openspec validate update-admin-password-reset-on-startup --strict` and resolve any reported issues.
- [x] 4.2 Manually verify in a local container: start with `UI_PASSWORD=passwordA`, log in; stop, restart with `UI_PASSWORD=passwordB`, confirm `passwordA` no longer works and `passwordB` does.
