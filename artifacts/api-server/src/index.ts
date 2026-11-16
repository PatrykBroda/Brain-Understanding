import app from "./app";
import { logger } from "./lib/logger";
import { now } from "./lib/clock";
import { ExpoPushSender, runPushJob } from "./lib/pushService";
import { drizzlePushStore } from "./lib/pushStore";

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
  // Node's default keep-alive is 5s. Proxies and iOS reuse idle connections for
  // longer than that, so the first request after a pause could land on a socket
  // the server had just closed. Keep sockets open longer than the proxy does, and
  // headersTimeout must stay above keepAliveTimeout.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

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

// Inbox generation runs for every athlete account. Remote device delivery is
// separately gated so enabling the inbox cannot unexpectedly turn on push alerts.
const intervalMs = Number(process.env["PUSH_JOB_INTERVAL_MS"]) || 15 * 60_000;
const sender = new ExpoPushSender();
let pushJobRunning = false;
setInterval(() => {
  if (pushJobRunning) return;
  pushJobRunning = true;
  runPushJob({
    store: drizzlePushStore,
    sender,
    now: now(),
    sendRemote: process.env["PUSH_JOB_ENABLED"] === "true",
  })
    .then((r) => logger.info(r, "notification job finished"))
    .catch((err) => logger.error({ err }, "notification job failed"))
    .finally(() => {
      pushJobRunning = false;
    });
}, intervalMs).unref();
if (process.env["PUSH_JOB_ENABLED"] !== "true") {
  logger.warn("push job disabled (PUSH_JOB_ENABLED is not true): no remote push notifications will be sent");
}
