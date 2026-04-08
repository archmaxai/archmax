## 1. Redis infrastructure in @semlayer/core

- [ ] 1.1 Add `ioredis` and `bullmq` dependencies to `packages/core/package.json`
- [ ] 1.2 Create `packages/core/src/infra/redis.ts` — lazy ioredis singleton (`getRedis()`, `closeRedis()`), returns `null` when `REDIS_URL` is unset; cancel helpers (`publishCancelSignal`, `isCancelFlagSet`, `clearCancelFlag`)
- [ ] 1.3 Add `REDIS_URL` (optional string) and `WORKER_CONCURRENCY` (optional string) to env schema in `packages/core/src/config/env.ts`
- [ ] 1.4 Update `.env.example` with `REDIS_URL` and `WORKER_CONCURRENCY`

## 2. Queue module in @semlayer/core

- [ ] 2.1 Create `packages/core/src/queue/constants.ts` — queue name `agent-runs`, cancel channel prefix, TTLs, default concurrency
- [ ] 2.2 Create `packages/core/src/queue/types.ts` — `AgentJobData` and `AgentJobResult` interfaces
- [ ] 2.3 Create `packages/core/src/queue/connection.ts` — `getQueueConnectionOptions()` parsing `REDIS_URL` into BullMQ `ConnectionOptions`
- [ ] 2.4 Create `packages/core/src/queue/producer.ts` — lazy `Queue` singleton, `enqueueAgentJob()`, `closeQueue()`

## 3. Move agent creation to @semlayer/core

- [ ] 3.1 Move `createSemlayerAgent` from `apps/api/src/services/agent.ts` to `packages/core/src/services/agent.ts` so both the API (fallback) and worker can import it
- [ ] 3.2 Update `apps/api/src/routes/agent.ts` and `apps/api/src/services/agent.ts` imports to use the new location

## 4. Streaming bridge

- [ ] 4.1 Create `packages/core/src/streaming/stream-bridge.ts` — `publishStreamEvent(conversationId, event)` for worker-side publishing, `subscribeToStream(conversationId, callback)` for API-side subscription
- [ ] 4.2 Define stream event shape: `{ event: string, data: string }` matching the SSE protocol from `add-streaming-chat`

## 5. Worker app

- [ ] 5.1 Create `apps/worker/package.json` with `bullmq`, `ioredis`, `@semlayer/core` dependencies
- [ ] 5.2 Create `apps/worker/tsconfig.json`
- [ ] 5.3 Create `apps/worker/src/env.ts` — dotenv loader
- [ ] 5.4 Create `apps/worker/src/processor.ts` — `processAgentJob` function: load conversation, create agent, run pipeline, publish stream events to Redis, finalize assistant message; handle cancellation via Redis pub/sub + AbortController
- [ ] 5.5 Create `apps/worker/src/index.ts` — main entry: connect MongoDB, create BullMQ Worker, wire lifecycle events (active/completed/failed/stalled/error), graceful shutdown handlers
- [ ] 5.6 Add `apps/worker` to root `pnpm-workspace.yaml` (or `package.json` workspaces)

## 6. API route changes

- [ ] 6.1 Update `POST /api/projects/:projectId/agent/chat` to enqueue a job when Redis is available, fall back to in-process execution when not
- [ ] 6.2 Update SSE endpoint to subscribe to Redis pub/sub (`stream-events:{conversationId}`) and forward events, with fallback to direct emission
- [ ] 6.3 Add `POST /api/projects/:projectId/agent/cancel/:conversationId` endpoint — publish cancel signal + set cancel flag in Redis

## 7. Deployment

- [ ] 7.1 Create `entrypoint.sh` that starts worker in background and API in foreground
- [ ] 7.2 Update `Dockerfile` (if exists) to build the worker app alongside the API

## 8. Testing

- [ ] 8.1 Write unit test for `enqueueAgentJob` (mock BullMQ Queue, verify job name and ID)
- [ ] 8.2 Write unit test for `processAgentJob` (mock agent, verify Redis publish calls, cancellation flow)
- [ ] 8.3 Write unit test for `getQueueConnectionOptions` (various REDIS_URL formats)
- [ ] 8.4 Manual end-to-end test: send a message, verify job is enqueued, worker processes it, streaming events arrive via SSE, cancel mid-stream
