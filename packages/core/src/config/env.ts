import { z } from "zod/v4";

const envSchema = z.object({
  NODE_ENV: z.string().optional(),

  MONGODB_URI: z.string(),

  PORT: z.string().optional().default("3000"),

  CORS_ORIGINS: z.string().optional().default("http://localhost:5173"),

  MCP_BEARER_TOKEN: z.string().optional(),
  MCP_RATE_LIMIT_MAX: z.string().optional().default("120"),

  BETTER_AUTH_SECRET: z.string().min(32),

  UI_USERNAME: z.string().optional().default("admin"),
  UI_PASSWORD: z.string(),
});

let _env: z.infer<typeof envSchema> | null = null;

export function getEnv(): z.infer<typeof envSchema> {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error(
        "Invalid environment configuration:",
        JSON.stringify(z.treeifyError(result.error), null, 2),
      );
      throw new Error("Invalid environment configuration");
    }
    _env = result.data;
  }
  return _env;
}

export type Env = z.infer<typeof envSchema>;
