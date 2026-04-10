import "./env";
import { serve } from "@hono/node-server";
import app from "./app";
import { getEnv } from "@archmax/core/config/env";
import { connectDB } from "@archmax/core/infra/db";
import { seedAdmin } from "./lib/seed-admin";

const PORT = parseInt(getEnv().PORT, 10);

console.log(`Starting server on port ${PORT}...`);

connectDB()
  .then(() => seedAdmin())
  .catch((err) => {
    console.error("Failed to initialize:", err);
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
