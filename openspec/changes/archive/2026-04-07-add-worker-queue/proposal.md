# Change: Add BullMQ worker queue with Redis for agent execution

## Why
The agent pipeline currently runs in-process inside the Hono API server (`agent.invoke()` in the route handler). This blocks the API process during long-running LLM calls and tool executions, makes cancellation impossible, and couples agent reliability to the API's availability. Moving agent execution to a dedicated BullMQ worker process backed by Redis — the same pattern used in archmax_chat — decouples the API from the agent pipeline, enables job cancellation, and allows independent scaling of workers.

## What Changes
- **New: Redis infrastructure** — Add `ioredis` singleton (`getRedis()`) in `@semlayer/core/infra/redis` and BullMQ connection options parser (`getQueueConnectionOptions()`) in `@semlayer/core/queue/connection`
- **New: Queue producer** — Lazy `Queue` singleton and `enqueueAgentJob()` in `@semlayer/core/queue/producer`
- **New: Worker app** — `apps/worker/` with BullMQ `Worker` on queue `agent-runs`, processor that calls the existing `createSemlayerAgent` + runs the pipeline
- **New: Streaming bridge** — Worker publishes SSE events to Redis pub/sub (`stream-events:{conversationId}`); API subscribes and forwards to the SSE response
- **New: Cancellation** — `POST /api/projects/:projectId/agent/cancel/:conversationId` endpoint; Redis pub/sub + persistent cancel flag for queued/running job cancellation
- **API route change** — `POST /api/projects/:projectId/agent/chat` enqueues a job and returns immediately instead of running the agent in-process
- **Env vars** — Add `REDIS_URL` (required), `WORKER_CONCURRENCY` (optional, default 5)
- **Deployment** — `entrypoint.sh` starts worker in background + API in foreground (same container; separable later)

## Impact
- Affected specs: `semantic-model-agent` (execution moves to worker, streaming via Redis bridge)
- New spec: `agent-job-queue` (queue, worker, cancellation, streaming continuity)
- Affected code:
  - `packages/core/` — new `infra/redis.ts`, `queue/` module (connection, constants, types, producer)
  - `apps/worker/` — new worker app (index, processor, env, package.json)
  - `apps/api/src/routes/agent.ts` — enqueue instead of in-process execution; SSE reads from Redis
  - `apps/api/src/routes/conversations.ts` — cancel endpoint
  - `packages/core/src/config/env.ts` — `REDIS_URL`, `WORKER_CONCURRENCY`
  - `.env.example` — document new vars
  - `package.json` (root) — add worker to workspace
- Dependency: `add-streaming-chat` should land first (establishes the SSE event protocol); this change then routes those events through Redis instead of emitting them directly
