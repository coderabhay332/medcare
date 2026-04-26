import app from "./app.js";
import { logger } from "./lib/logger.js";
import { connectDB } from "./app/common/services/db.js";
import { warmFuzzyIndex } from "./app/common/services/medicineIndex.js";

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

async function start(): Promise<void> {
  // Connect to MongoDB if URI is configured
  const mongoUri = process.env["MONGODB_URI"];
  if (mongoUri) {
    await connectDB();
    // Warm the brand fuzzy-match index in the background so the first scan
    // isn't slow. We don't await — server can start serving while it builds.
    warmFuzzyIndex().catch(err => logger.warn({ err }, "fuzzy index warm-up failed (non-fatal)"));
  } else {
    logger.warn("MONGODB_URI not set — running without MongoDB. Auth/patient endpoints will not work.");
  }

  app.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

start().catch(err => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
