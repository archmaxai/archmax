# Change: Graceful startup failure on missing/invalid environment variables

## Why

When required environment variables (`BETTER_AUTH_SECRET`, `UI_PASSWORD`) are missing or invalid, the API server and worker crash with raw Zod error JSON and a Node.js stack trace. In Docker this causes a crash-loop with noisy, unfriendly output that makes it hard for users to understand what went wrong and how to fix it.

## What Changes

- Replace the crash-on-bad-env behavior with a human-readable error banner listing each missing/invalid variable, what it expects, and how to fix it
- After printing the error, keep the process alive (sleep loop) so the Docker container stays "running" instead of crash-looping, giving users time to read logs and fix their configuration
- Apply the same pattern to both the API server and the BullMQ worker
- The entrypoint script prints its own pre-flight check for the two truly required vars before spawning Node processes, providing an even earlier safety net with shell-level messaging

## Impact

- Affected specs: `deployment` (entrypoint behavior), `hono-api` (startup behavior)
- Affected code: `packages/core/src/config/env.ts`, `apps/api/src/index.ts`, `apps/worker/src/index.ts`, `entrypoint.sh`
