import app from "./app";
import { logger } from "./lib/logger";
import { ensureTables, pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// IMPORTANT: start listening before any external dependency work.
// Render expects the HTTP port to become reachable quickly during deploys.
// Database initialization is deliberately performed in the background so a
// slow/unreachable Supabase connection cannot make the Render deployment
// time out before the health check can reach "/".
const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");

  void ensureTables().then(() => {
    logger.info("Database initialization completed");
  }).catch((error) => {
    // ensureTables is intentionally non-fatal. Individual API operations
    // will surface database errors if the database is unavailable.
    logger.warn({ err: error }, "Database initialization failed");
  });
});

// Render sends SIGTERM when replacing/restarting an instance. Close the
// HTTP server explicitly so the pnpm wrapper exits cleanly instead of
// reporting ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL.
let shuttingDown = false;

const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Shutdown signal received; closing HTTP server");

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "Error while closing HTTP server");
      process.exit(1);
    }

    logger.info("HTTP server closed cleanly");
    await pool.end().catch((error) => logger.warn({ err: error }, "Database pool close failed"));
    process.exit(0);
  });

  // Do not let a stuck connection keep a Render instance alive forever.
  setTimeout(() => {
    logger.warn("Forced shutdown after graceful shutdown timeout");
    process.exit(0);
  }, 10000).unref();
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
