import { cors } from "hono/cors";
import { getEnv } from "@archmax/core/config/env";

export const corsMiddleware = cors({
  origin: getEnv().corsOrigins,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 86400,
  credentials: true,
});
