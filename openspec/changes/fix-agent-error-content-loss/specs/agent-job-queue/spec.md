## MODIFIED Requirements
### Requirement: Worker Process

The system SHALL provide a dedicated worker application (`apps/worker/`) that runs as a separate Node.js process from the API. In the default deployment, both processes run in the same Docker container (started via `entrypoint.sh`), but the architecture MUST remain separable into independent services without code changes.

The worker SHALL instantiate a BullMQ `Worker` connected to the `agent-runs` queue and process jobs by executing the agent pipeline via `createSemlayerAgent`.

The worker processor MUST:
- Load the conversation history from MongoDB
- Create the deep agent with filesystem backend and DuckDB tools for the project
- Execute the agent pipeline (stream or invoke)
- Publish streaming events to Redis pub/sub for the API's SSE endpoint
- Finalize the assistant message in MongoDB on completion or error
- On error, persist any partial content (text, tool calls, segments) accumulated before the failure alongside the error indicator, rather than replacing it with a generic error message

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

- **GIVEN** a job is being processed and the agent pipeline throws an error after streaming partial content
- **WHEN** the pipeline catches the error
- **THEN** the assistant message is finalized with all partial content preserved (text, tool calls, segments) plus an error text segment appended
- **AND** an optional `error` field is set on the assistant message with the specific error message
- **AND** a stream complete event is published to Redis
- **AND** the BullMQ job fails with a descriptive error (UnrecoverableError, no retry)

#### Scenario: Worker handles pipeline error with no prior content

- **GIVEN** a job is being processed and the agent pipeline throws an error before producing any content
- **WHEN** the pipeline catches the error
- **THEN** the assistant message is finalized with an error text segment containing the specific error message
- **AND** the `error` field is set on the assistant message
- **AND** a stream complete event is published to Redis

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
