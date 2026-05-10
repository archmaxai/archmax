import "./env";
import { serve } from "@hono/node-server";
import app from "./app";
import { validateEnvOrSleep } from "@archmax/core/config/env";
import { connectDB } from "@archmax/core/infra/db";
import { runMigrations } from "@archmax/core/infra/migrations/runner";
import { disposeAllProjectInstances } from "@archmax/core/services/duckdb";
import { seedAdmin } from "./lib/seed-admin";

const env = await validateEnvOrSleep();
const PORT = parseInt(env.PORT, 10);

function printBanner(port: number) {
  const reset = "\x1b[0m";
  const bold = "\x1b[1m";
  const dim = "\x1b[2m";
  const white = "\x1b[97m";
  const cyan = "\x1b[36m";

  const stops: [number, number, number][] = [
    [194, 208, 228], // blue   #c2d0e4
    [136, 120, 168], // purple #8878a8
    [188, 161, 149], // rose   #bca195
    [140, 152, 127], // sage   #8c987f
  ];

  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const rgb = (t: number): [number, number, number] => {
    const seg = t * (stops.length - 1);
    const i = Math.min(Math.floor(seg), stops.length - 2);
    const f = seg - i;
    return [lerp(stops[i][0], stops[i + 1][0], f), lerp(stops[i][1], stops[i + 1][1], f), lerp(stops[i][2], stops[i + 1][2], f)];
  };

  const lines = [
    "               _                            ",
    "  __ _ _ __ ___| |__  _ __ ___   __ ___  __ ",
    " / _` | '__/ __| '_ \\| '_ ` _ \\ / _` \\ \\/ /",
    "| (_| | | | (__| | | | | | | | | (_| |>  < ",
    " \\__,_|_|  \\___|_| |_|_| |_| |_|\\__,_/_/\\_\\",
  ];

  const width = Math.max(...lines.map((l) => l.length));
  const colorize = (line: string) =>
    [...line]
      .map((ch, i) => {
        if (ch === " ") return ch;
        const [r, g, b] = rgb(i / (width - 1));
        return `\x1b[1;38;2;${r};${g};${b}m${ch}`;
      })
      .join("") + reset;

  const art = "\n" + lines.map(colorize).join("\n") + "\n";

  const nodeEnv = env.NODE_ENV ?? "development";
  const info = [
    `${dim}──────────────────────────────────────────────${reset}`,
    `  ${white}${bold}App${reset}        ${cyan}http://localhost:8080${reset}  ${dim}(Docker)${reset}`,
    `  ${white}${bold}API${reset}        ${cyan}http://localhost:${port}${reset}  ${dim}(internal)${reset}`,
    `  ${white}${bold}Frontend${reset}   ${cyan}http://localhost:5173${reset}  ${dim}(vite dev)${reset}`,
    `${dim}──────────────────────────────────────────────${reset}`,
    `  ${dim}env: ${nodeEnv}${reset}`,
    "",
  ];

  console.log(art + info.join("\n"));
}

await connectDB();
await runMigrations();
await seedAdmin();

const server = serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  printBanner(info.port);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Kill the existing process or use a different PORT.`);
    process.exit(1);
  }
  throw err;
});

// ── Graceful shutdown ────────────────────────────────────────────────
//
// On SIGTERM/SIGINT we close every cached DuckDB instance so the file lock
// on each project's persistent `duckdb.db` is released before the process
// exits. Without this, an immediate restart fails with
// `IO Error: Could not set lock on file`.

let shuttingDown = false;
async function gracefulShutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] Received ${signal}, closing DuckDB instances…`);
  try {
    await disposeAllProjectInstances();
  } catch (err) {
    console.error("[shutdown] Error closing DuckDB instances:", err);
  }
  server.close(() => {
    process.exit(0);
  });
  // Hard exit if server.close() does not fire within 10s.
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM"); });
process.on("SIGINT", () => { void gracefulShutdown("SIGINT"); });
