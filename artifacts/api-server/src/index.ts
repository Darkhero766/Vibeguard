import app from "./app";
import { logger } from "./lib/logger";
import { ensureTables } from "@workspace/db";

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

// Run idempotent table migrations before accepting traffic.
// Non-fatal: Supabase may not be reachable from the Replit dev sandbox,
// but IS reachable in the production deployment where the table is created
// automatically on first boot.
await ensureTables();

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
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
