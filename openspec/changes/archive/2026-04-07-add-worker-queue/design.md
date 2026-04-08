## Context

The semlayer API currently runs the LangChain Deep Agent pipeline in-process: the Hono route handler calls `agent.invoke()`, waits for the full result, then streams it as a single SSE event. This blocks the API thread for the duration of the LLM call (seconds to minutes) and makes cancellation impossible.

The archmax_chat project solved this with a BullMQ job queue: the API enqueues a job, a separate worker process picks it up and runs the agent pipeline, and Redis pub/sub bridges streaming events back to the API's SSE endpoint. This proposal replicates that pattern for semlayer, adapted to the simpler single-user model.

## Goals / Non-Goals

- **Goals:**
  - Decouple agent execution from the API process
  - Enable job cancellation (queued and in-flight)
  - Redis pub/sub bridge so the API's SSE endpoint can forward streaming events from the worker
  - Same-container deployment with the option to split later
  - Reuse existing `createSemlayerAgent` and tool setup unchanged

- **Non-Goals:**
  - Multi-worker horizontal scaling (single-user system; one worker suffices)
  - Redis-backed session/stream state beyond pub/sub (no polling endpoint, no event log)
  - Rate limiting or access-control changes (single-user, already session-gated)
  - Headless enqueue API for external callers (no schedulers/webhooks in semlayer)

## Decisions

### Architecture: API → Queue → Worker → Redis → SSE

```
┌──────────┐    enqueue    ┌───────┐    job    ┌──────────┐
│  API     │──────────────▶│ Redis │──────────▶│  Worker  │
│ (Hono)   │               │(BullMQ)│           │(BullMQ)  │
│          │◀──────────────│       │◀──────────│          │
│  SSE ↑   │   pub/sub     │       │  publish  │ pipeline │
└──────────┘               └───────┘           └──────────┘
     │
     ▼
  Frontend
```

- **API** validates the request, persists messages to MongoDB, enqueues a BullMQ job, returns `{ conversationId, assistantMessageId }` immediately, then the SSE endpoint subscribes to Redis pub/sub for streaming events.
- **Worker** picks up the job, creates the deep agent, runs the pipeline, publishes streaming events to Redis, finalizes the assistant message in MongoDB.
- **Redis** serves dual purpose: BullMQ queue backend + pub/sub for streaming events.

This mirrors archmax_chat's architecture exactly, simplified for single-user (no tenant scoping, no S3 uploads, no rate limits).

### Redis Connection Strategy

Following archmax_chat's pattern:

- **App Redis (`getRedis()`)**: Lazy ioredis singleton used for pub/sub streaming and cancel signals. Returns `null` if `REDIS_URL` is not set (degraded mode: agent runs in-process as fallback).
- **BullMQ Redis**: Parsed from the same `REDIS_URL` but BullMQ manages its own connection pool via `ConnectionOptions`. This avoids sharing the ioredis instance which can cause issues with BullMQ's internal connection management.

### Queue Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Queue name | `agent-runs` | Same as archmax_chat |
| Job name | `"execute"` | Single job type |
| Job ID | `assistantMessageId` | Unique per turn; prevents BullMQ dedup conflicts |
| `attempts` | `1` | Agent failures are not retryable (LLM state lost) |
| `removeOnComplete` | `24h` | Match archmax_chat |
| `removeOnFail` | `7d` | Match archmax_chat |
| `concurrency` | `WORKER_CONCURRENCY` (default 5) | Lower default than archmax_chat's 20 — single-user system |
| `stalledInterval` | `60s` | Detect crashed workers |
| `maxStalledCount` | `2` | Match archmax_chat |

### Job Data Shape

```ts
interface AgentJobData {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  message: string;
}

interface AgentJobResult {
  conversationId: string;
  assistantMessageId: string;
  elapsedMs: number;
}
```

Deliberately minimal compared to archmax_chat (no tenant, no auth user, no content parts) — semlayer is single-user and the worker can load conversation history from MongoDB.

### Streaming Bridge

The worker publishes SSE-format events to Redis channel `stream-events:{conversationId}`:
- Each event is a JSON string `{ event, data }` matching the SSE protocol from `add-streaming-chat` (`token`, `tool_call_start`, `tool_call_end`, `step`, `error`, `done`).
- The API's SSE endpoint subscribes to this channel with a duplicated Redis client and forwards events to the HTTP response.
- On stream completion (`done` event), the subscriber unsubscribes and the SSE response closes.

No event log (Redis list) is needed because semlayer doesn't have a polling fallback — SSE only.

### Cancellation

Two-phase cancellation matching archmax_chat:

1. **Running jobs**: API publishes to `job-cancel:{conversationId}` Redis channel. Worker subscribes at job start, aborts the `AbortController` → propagates to `agent.stream()` signal.
2. **Queued jobs**: API sets `job-cancel-flag:{conversationId}` with 5-minute TTL. Worker checks flag before starting pipeline.

Cancel endpoint: `POST /api/projects/:projectId/agent/cancel/:conversationId`

### Graceful Degradation (No Redis)

If `REDIS_URL` is not set:
- `getRedis()` returns `null`, `getQueueConnectionOptions()` throws
- The API falls back to in-process execution (current behavior)
- This keeps the development experience simple — Redis is only required for production worker mode

### Deployment

Same-container deployment via `entrypoint.sh`:
```sh
cd /app/apps/worker && node worker.mjs &
cd /app/apps/api && PORT=3000 node server.mjs &
exec nginx -g 'daemon off;'
```

Separable into independent services by deploying `apps/worker` and `apps/api` to different containers pointing at the same Redis and MongoDB.

## Risks / Trade-offs

- **Redis dependency** — Adds a required infrastructure component for worker mode. Mitigated by graceful degradation to in-process execution when Redis is absent.
- **Streaming latency** — Redis pub/sub adds a small hop vs direct SSE emission. Negligible for LLM token speeds.
- **Interaction with `add-streaming-chat`** — That change plans to emit SSE events directly from `agent.stream()` in the API. This change moves execution to the worker, so the streaming events route through Redis. Implementation order: land streaming first, then rewire the event publishing to go through Redis.
- **Worker crashes during execution** — BullMQ stalled job detection handles this; assistant message may be left incomplete. Mitigation: finalize with `error: "internal_error"` on stall detection.

## Open Questions

- Should the worker reuse the API's `createSemlayerAgent` directly, or should agent creation be extracted to `@semlayer/core`? Currently it lives in `apps/api/src/services/agent.ts`. Recommendation: move to `@semlayer/core/services/agent` so both API (fallback) and worker can import it.
