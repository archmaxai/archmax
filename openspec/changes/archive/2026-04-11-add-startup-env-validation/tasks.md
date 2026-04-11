## 1. Core env validation with friendly output

- [x] 1.1 Add a `validateEnvOrSleep()` function in `packages/core/src/config/env.ts` that calls `safeParse`, and on failure prints a clean boxed error message listing each invalid/missing variable with a one-line fix hint, then enters an infinite sleep loop (`setInterval(() => {}, 60_000)`)
- [x] 1.2 The error output must not include raw Zod JSON or stack traces; use plain `console.error` with ANSI formatting (red/bold/dim) for readability in both terminal and `docker logs`

## 2. API server graceful startup

- [x] 2.1 In `apps/api/src/index.ts`, replace the top-level `getEnv()` call with `await validateEnvOrSleep()` so the process never throws an unhandled error on bad config
- [x] 2.2 Wrap `connectDB()` and `serve()` inside the success path only

## 3. Worker graceful startup

- [x] 3.1 In `apps/worker/src/index.ts`, call `validateEnvOrSleep()` before `main()` so the worker sleeps on bad config instead of exiting with code 1

## 4. Entrypoint pre-flight check

- [x] 4.1 In `entrypoint.sh`, after embedded MongoDB/Redis setup but before spawning Node processes, check that `BETTER_AUTH_SECRET` and `UI_PASSWORD` are set; if not, print a clear message and `exec sleep infinity` so the container stays up

## 5. Verification

- [x] 5.1 Run `pnpm typecheck` and `pnpm lint` to confirm no build regressions
- [x] 5.2 Manually verify: start the API without `BETTER_AUTH_SECRET` and confirm the friendly message appears with no stack trace, and the process stays alive
