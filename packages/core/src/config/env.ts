import { z } from "zod/v4";

const envSchema = z.object({
  NODE_ENV: z.string().optional(),

  MONGODB_URI: z.string(),

  PORT: z.string().optional().default("3000"),

  CORS_ORIGINS: z.string().optional().default("http://localhost:5173"),

  SEMLAYER_DATA_DIR: z.string().optional().default("data/projects"),

  MCP_RATE_LIMIT_MAX: z.string().optional().default("120"),

  AUTH_BASE_URL: z.string().optional(),

  BETTER_AUTH_SECRET: z.string().min(32),

  UI_USERNAME: z.string().optional().default("admin"),
  UI_PASSWORD: z.string(),

  AGENT_API_BASE_URL: z.string().optional().default("https://openrouter.ai/api/v1"),
  AGENT_API_KEY: z.string().optional(),
  AGENT_MODEL: z.string().optional().default("anthropic/claude-sonnet-4"),
  AGENT_TITLE_MODEL: z.string().optional().default("anthropic/claude-haiku-4-5-20250929"),

  // Redis / Worker queue (optional — without Redis the agent runs in-process)
  REDIS_URL: z.string().optional(),
  WORKER_CONCURRENCY: z.string().optional(),

  // Testing
  TEST_AGENT_MAX_ITERATIONS: z.string().optional().default("100"),

  // GitHub OAuth (optional — required only when GitHub integration is used)
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
});

type RawEnv = z.infer<typeof envSchema>;
type ParsedEnv = RawEnv & { corsOrigins: string[] };

let _env: ParsedEnv | null = null;

export function getEnv(): ParsedEnv {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error(
        "Invalid environment configuration:",
        JSON.stringify(z.treeifyError(result.error), null, 2),
      );
      throw new Error("Invalid environment configuration");
    }
    const raw = result.data;
    _env = {
      ...raw,
      corsOrigins: raw.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    };
  }
  return _env;
}

export type Env = ParsedEnv;
