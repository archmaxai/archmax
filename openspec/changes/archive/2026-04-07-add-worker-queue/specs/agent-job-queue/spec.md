## ADDED Requirements

### Requirement: Agent Execution Job Queue

The system SHALL use a BullMQ job queue backed by Redis to manage agent execution. When a user submits a chat message via `POST /api/projects/:projectId/agent/chat`, the API process SHALL validate the request, persist the user message and an empty assistant message to MongoDB, and enqueue a job on the `agent-runs` queue. The API process SHALL NOT execute the agent pipeline itself.

The job data MUST include: `projectId`, `conversationId`, `assistantMessageId`, and `message`. The worker retrieves conversation history and agent configuration from MongoDB using these identifiers.

The job ID MUST be the `assistantMessageId` (unique per turn) so that multiple messages in the same conversation can be processed sequentially without BullMQ deduplication conflicts.

The BullMQ queue connection MUST be configured from the `REDIS_URL` environment variable. The queue SHALL use `attempts: 1` (agent failures are not retryable), retain completed jobs for 24 hours, and retain failed jobs for 7 days.

#### Scenario: Chat message enqueued as a job

- **GIVEN** a valid `POST /api/projects/:projectId/agent/chat` request with `message` and optional `conversationId`
- **WHEN** the API process validates the request and persists the user and assistant messages
- **THEN** the API enqueues a job on the `agent-runs` BullMQ queue with the `assistantMessageId` as the job ID
- **AND** returns `{ conversationId, assistantMessageId }` immediately without executing the agent pipeline

#### Scenario: Second message in the same conversation

- **GIVEN** a completed job exists for a previous message in a conversation
- **WHEN** the user sends a new message in the same conversation
- **THEN** the API enqueues a new job with the new `assistantMessageId` as the job ID
- **AND** the job is processed normally because the job ID is unique per turn

#### Scenario: Redis unavailable at enqueue time

- **GIVEN** Redis is unreachable when the API attempts to enqueue a job
- **WHEN** the `enqueueAgentJob` call fails
- **THEN** the API returns HTTP 500 with an appropriate error message
- **AND** the empty assistant message is deleted to prevent empty message bubbles

### Requirement: Worker Process

The system SHALL provide a dedicated worker application (`apps/worker/`) that runs as a separate Node.js process from the API. In the default deployment, both processes run in the same Docker container (started via `entrypoint.sh`), but the architecture MUST remain separable into independent services without code changes.

The worker SHALL instantiate a BullMQ `Worker` connected to the `agent-runs` queue and process jobs by executing the agent pipeline via `createSemlayerAgent`.

The worker processor MUST:
- Load the conversation history from MongoDB
- Create the deep agent with filesystem backend and DuckDB tools for the project
- Execute the agent pipeline (stream or invoke)
- Publish streaming events to Redis pub/sub for the API's SSE endpoint
- Finalize the assistant message in MongoDB on completion or error

The worker MUST handle graceful shutdown (`SIGTERM`, `SIGINT`) by stopping acceptance of new jobs, waiting for active jobs to complete, and closing Redis and MongoDB connections.

The number of concurrent jobs per worker instance MUST be configurable via the `WORKER_CONCURRENCY` environment variable, defaulting to 5.

#### Scenario: Worker processes an agent job

- **GIVEN** a job is enqueued with valid `AgentJobData`
- **WHEN** the worker picks up the job
- **THEN** it creates the deep agent for the specified project
- **AND** executes the agent pipeline with the user's message and conversation history
- **AND** streaming events are published to Redis pub/sub
- **AND** the assistant message is finalized in MongoDB with the accumulated content

#### Scenario: Worker handles pipeline error

- **GIVEN** a job is being processed and the LLM returns an error
- **WHEN** the pipeline catches the error
- **THEN** the assistant message is finalized with an error indicator
- **AND** a stream complete event is published to Redis
- **AND** the BullMQ job fails with a descriptive error (UnrecoverableError, no retry)

#### Scenario: Worker graceful shutdown

- **GIVEN** the worker process receives `SIGTERM`
- **WHEN** the worker begins shutdown
- **THEN** it stops accepting new jobs from the queue
- **AND** waits for currently active jobs to complete
- **AND** closes all Redis and MongoDB connections cleanly

#### Scenario: Worker concurrency configuration

- **GIVEN** the `WORKER_CONCURRENCY` environment variable is set to `3`
- **WHEN** the worker starts
- **THEN** it processes up to 3 jobs concurrently

### Requirement: Streaming Continuity via Redis

The API's SSE endpoint SHALL subscribe to Redis pub/sub to receive streaming events published by the worker, forwarding them to the frontend. The SSE event types (`token`, `tool_call_start`, `tool_call_end`, `step`, `error`, `done`) SHALL be identical to the protocol defined in the `semantic-model-agent` spec.

When a client connects to the SSE endpoint after a job is enqueued, the API MUST subscribe to the `stream-events:{conversationId}` Redis channel using a duplicated Redis client. Each published event SHALL be forwarded as an SSE event to the HTTP response. When a `done` event is received, the subscriber MUST unsubscribe and the SSE response MUST close.

#### Scenario: SSE stream receives events from worker

- **GIVEN** the client connects to the SSE endpoint for a conversation
- **AND** the worker is processing the corresponding agent job
- **WHEN** the worker publishes a `token` event to `stream-events:{conversationId}`
- **THEN** the SSE endpoint forwards the event to the client

#### Scenario: Stream completion

- **GIVEN** the worker has finished processing a job
- **WHEN** it publishes a `done` event to `stream-events:{conversationId}`
- **THEN** the API unsubscribes from the Redis channel
- **AND** the SSE response is closed

### Requirement: Job Cancellation

The system SHALL provide a mechanism for clients to cancel an agent job that is either queued or actively running. The API SHALL expose a `POST /api/projects/:projectId/agent/cancel/:conversationId` endpoint that triggers cancellation.

**Running jobs** — cancellation via Redis pub/sub:
1. The API publishes a cancel signal to `job-cancel:{conversationId}`
2. The worker subscribes to this channel at job start and aborts the `AbortController` on signal
3. The abort propagates to the agent pipeline (via the `signal` option on `agent.stream()`)
4. The assistant message is finalized with partial content preserved
5. A `done` event is published to Redis

**Queued jobs** — cancellation via persistent Redis flag:
1. The API sets `job-cancel-flag:{conversationId}` with a 5-minute TTL
2. When the worker picks up the job, it checks the flag before starting
3. If set, the worker skips execution and finalizes the assistant message
4. The flag is cleared after consumption

#### Scenario: User cancels a running agent

- **GIVEN** an agent job is actively processing for a conversation
- **WHEN** the user calls the cancel endpoint
- **THEN** the API publishes a cancel signal and sets the persistent cancel flag
- **AND** the worker aborts the agent pipeline
- **AND** partial content is preserved on the assistant message
- **AND** a `done` event is published so the SSE stream completes

#### Scenario: User cancels a queued job

- **GIVEN** an agent job is enqueued but no worker has picked it up
- **WHEN** the user calls the cancel endpoint
- **THEN** the API sets a persistent cancel flag in Redis
- **AND** when the worker picks up the job, it detects the flag and skips execution

#### Scenario: Cancel request for a completed job

- **GIVEN** the agent job has already completed
- **WHEN** the user calls the cancel endpoint
- **THEN** the endpoint returns `{ ok: true }` (best-effort, no-op)

### Requirement: Graceful Degradation Without Redis

When the `REDIS_URL` environment variable is not set, the system SHALL fall back to in-process agent execution (current behavior). The API route SHALL detect the absence of Redis and run the agent pipeline directly instead of enqueueing a job. This ensures the development experience remains simple — Redis is only required for production worker mode.

#### Scenario: No Redis configured

- **GIVEN** `REDIS_URL` is not set in the environment
- **WHEN** the user sends a chat message
- **THEN** the API executes the agent pipeline in-process (same as pre-worker behavior)
- **AND** SSE events are emitted directly without Redis pub/sub

#### Scenario: Redis configured

- **GIVEN** `REDIS_URL` is set to a valid Redis URL
- **WHEN** the user sends a chat message
- **THEN** the API enqueues a BullMQ job and streams events via Redis pub/sub

### Requirement: Stalled Job Recovery

The system SHALL configure BullMQ stalled job detection with `stalledInterval: 60000` and `maxStalledCount: 2`. When a job is detected as stalled (worker crashed), BullMQ SHALL move it to the failed state. The system SHOULD ensure the assistant message is finalized with an error state so clients are not left waiting.

#### Scenario: Worker crashes during job processing

- **GIVEN** a worker is processing an agent job and crashes
- **WHEN** BullMQ detects the stalled job
- **THEN** the job is moved to failed state after max stalled retries
