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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
