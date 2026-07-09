import app from "./app";
import { logger } from "./lib/logger";
import { initStripe } from "./lib/initStripe";

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

// On restart the previous instance can take a moment to release the port. Rather
// than dying immediately (which leaves the app 502ing until a manual restart),
// retry EADDRINUSE a bounded number of times before giving up.
const MAX_BIND_RETRIES = 10;
const BIND_RETRY_DELAY_MS = 1000;

function startListening(attempt = 1): void {
  const server = app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < MAX_BIND_RETRIES) {
      logger.warn(
        { port, attempt, maxAttempts: MAX_BIND_RETRIES },
        "Port in use (likely a restart handoff), retrying shortly",
      );
      setTimeout(() => startListening(attempt + 1), BIND_RETRY_DELAY_MS);
      return;
    }

    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

startListening();

// Fire-and-forget: Stripe schema/webhook/backfill must never block or crash
// boot (see boot-reliability constraint). Billing degrades gracefully.
void initStripe();
