import { join } from "node:path";
import { z } from "zod/v4";

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  APP_VERSION: z.string().optional().default("dev"),

  MONGODB_URI: z.string().optional(),

  PORT: z.string().optional().default("3000"),

  APP_BASE_URL: z.string().optional(),

  CORS_ORIGINS: z.string().optional(),

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
  AGENT_REQUEST_TIMEOUT: z.string().optional().default("300"),
  AGENT_MAX_RETRIES: z.string().optional().default("3"),
  QUERY_TIMEOUT_MS: z.string().optional().default("30000"),
  MAX_CONCURRENT_QUERIES: z.string().optional().default("10"),

  DUCKDB_ALLOW_UNSIGNED_EXTENSIONS: z.string().optional(),

  REDIS_URL: z.string().optional(),
  WORKER_CONCURRENCY: z.string().optional(),

  TEST_AGENT_MAX_ITERATIONS: z.string().optional().default("100"),

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
  APP_BASE_URL:
    "Public URL of this instance (e.g. https://archmax.example.com). Set this when running behind a reverse proxy to avoid CORS/auth origin errors.",
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
  const corsValue =
    raw.CORS_ORIGINS || raw.APP_BASE_URL || "http://localhost:5173";

  return {
    ...raw,
    AUTH_BASE_URL: raw.AUTH_BASE_URL || raw.APP_BASE_URL,
    corsOrigins: corsValue
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    projectsDir: join(raw.ARCHMAX_DATA_DIR, "projects"),
  };
}

function warnMissingBaseUrl(parsed: ParsedEnv): void {
  if (parsed.NODE_ENV === "production" && !parsed.APP_BASE_URL) {
    const yellow = "\x1b[33m";
    const bold = "\x1b[1m";
    const dim = "\x1b[2m";
    const reset = "\x1b[0m";
    console.error(
      `${yellow}${bold}  WARNING:${reset}${yellow} APP_BASE_URL is not set.${reset}`,
    );
    console.error(
      `${dim}  Set APP_BASE_URL to the public URL of this instance (e.g. https://archmax.example.com)${reset}`,
    );
    console.error(
      `${dim}  to avoid authentication and CORS errors behind a reverse proxy.${reset}`,
    );
    console.error("");
  }
}

export async function validateEnvOrSleep(): Promise<ParsedEnv> {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    printEnvError(formatEnvErrors(result.error));
    return sleepForever();
  }
  _env = buildParsedEnv(result.data);
  warnMissingBaseUrl(_env);
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

/**
 * Whether the federated DuckDB instances may load unsigned extensions.
 *
 * Off by default. Enabling it (`DUCKDB_ALLOW_UNSIGNED_EXTENSIONS=true|1`)
 * starts every DuckDB instance with `allow_unsigned_extensions` and lets the
 * federation console install extensions from a custom source. Unsigned
 * extensions run arbitrary native code, so this is an operator opt-in.
 */
export function allowUnsignedExtensions(): boolean {
  const raw = getEnv().DUCKDB_ALLOW_UNSIGNED_EXTENSIONS?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
