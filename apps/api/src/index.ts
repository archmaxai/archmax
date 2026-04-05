import "./env";
import { serve } from "@hono/node-server";
import app from "./app";
import { getEnv } from "@semlayer/core/config/env";
import { seedAdmin } from "./lib/seed-admin";

const PORT = parseInt(getEnv().PORT, 10);

console.log(`Starting server on port ${PORT}...`);

seedAdmin().catch((err) => {
  console.error("Failed to seed admin user:", err);
});

const server = serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Kill the existing process or use a different PORT.`);
    process.exit(1);
  }
  throw err;
});
