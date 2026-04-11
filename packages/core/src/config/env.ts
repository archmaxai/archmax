import { join } from "node:path";
import { z } from "zod/v4";

const envSchema = z.object({
  NODE_ENV: z.string().optional(),

  MONGODB_URI: z.string().optional(),

  PORT: z.string().optional().default("3000"),

  CORS_ORIGINS: z.string().optional().default("http://localhost:5173"),

  ARCHMAX_DATA_DIR: z.string().optional().default("data"),

  MCP_RATE_LIMIT_MAX: z.string().optional().default("120"),

  AUTH_BASE_URL: z.string().optional(),

  BETTER_AUTH_SECRET: z.string().min(32),

  UI_USERNAME: z.string().optional().default("admin"),
  UI_PASSWORD: z.string().min(8),

  AGENT_API_BASE_URL: z.string().optional().default("https://openrouter.ai/api/v1"),
  AGENT_API_KEY: z.string().optional(),
  AGENT_MODEL: z.string().optional().default("anthropic/claude-sonnet-4.6"),
  AGENT_TITLE_MODEL: z.string().optional().default("anthropic/claude-haiku-4-5-20250929"),

  REDIS_URL: z.string().optional(),
  WORKER_CONCURRENCY: z.string().optional(),

  TEST_AGENT_MAX_ITERATIONS: z.string().optional().default("100"),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
});

type RawEnv = z.infer<typeof envSchema>;
type ParsedEnv = RawEnv & { corsOrigins: string[]; projectsDir: string };

let _env: ParsedEnv | null = null;

const ENV_HINTS: Record<string, string> = {
  BETTER_AUTH_SECRET:
    "Required (min 32 chars). Generate with: openssl rand -base64 32",
  UI_PASSWORD:
    "Required (min 8 chars). The password used to log in to the admin UI.",
};

function formatEnvErrors(error: z.core.$ZodError): string[] {
  const lines: string[] = [];
  for (const issue of error.issues) {
    const key = issue.path[0] as string | undefined;
    if (!key) continue;
    const hint = ENV_HINTS[key];
    const reason =
      issue.code === "too_small"
        ? `must be at least ${(issue as z.core.$ZodIssueTooSmall).minimum} characters`
        : issue.message;
    lines.push(`  ${key}: ${reason}`);
    if (hint) lines.push(`    -> ${hint}`);
  }
  return lines;
}

function printEnvError(details: string[]): void {
  const red = "\x1b[31m";
  const bold = "\x1b[1m";
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";
  const bar = `${red}${dim}${"=".repeat(56)}${reset}`;

  console.error("");
  console.error(bar);
  console.error(`${red}${bold}  CONFIGURATION ERROR${reset}`);
  console.error(bar);
  console.error("");
  console.error(
    `${red}  The following environment variables are missing or invalid:${reset}`,
  );
  console.error("");
  for (const line of details) {
    console.error(`${red}${line}${reset}`);
  }
  console.error("");
  console.error(
    `${dim}  See .env.example for a complete reference.${reset}`,
  );
  console.error(
    `${dim}  The process will stay alive so you can inspect this message.${reset}`,
  );
  console.error(bar);
  console.error("");
}

function sleepForever(): Promise<never> {
  return new Promise(() => {
    setInterval(() => {}, 60_000);
  });
}

function buildParsedEnv(raw: RawEnv): ParsedEnv {
  return {
    ...raw,
    corsOrigins: raw.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    projectsDir: join(raw.ARCHMAX_DATA_DIR, "projects"),
  };
}

export async function validateEnvOrSleep(): Promise<ParsedEnv> {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    printEnvError(formatEnvErrors(result.error));
    return sleepForever();
  }
  _env = buildParsedEnv(result.data);
  return _env;
}

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
    _env = buildParsedEnv(result.data);
  }
  return _env;
}

export type Env = ParsedEnv;
