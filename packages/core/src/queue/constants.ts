export const AGENT_RUNS_QUEUE = "agent-runs";

export const TEST_RUNS_QUEUE = "test-runs";

export const JOB_CANCEL_CHANNEL_PREFIX = "job-cancel:";

export const STREAM_EVENTS_CHANNEL_PREFIX = "stream-events:";

export const STREAM_BUFFER_PREFIX = "stream-buffer:";

/** Stream buffers expire after 5 minutes to guard against orphaned keys. */
export const STREAM_BUFFER_TTL_SECONDS = 5 * 60;

export const DEFAULT_WORKER_CONCURRENCY = 5;

/** Keep completed jobs in Redis for 24 hours. */
export const COMPLETED_JOB_TTL_SECONDS = 24 * 60 * 60;

/** Keep failed jobs in Redis for 7 days. */
export const FAILED_JOB_TTL_SECONDS = 7 * 24 * 60 * 60;
