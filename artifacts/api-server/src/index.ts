import app from "./app.js";
import { logger } from "./lib/logger.js";
import { connectDB } from "./app/common/services/db.js";
import { initMedicineIndex } from "./app/common/services/medicineIndex.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  } else {
    logger.warn("MONGODB_URI not set — running without MongoDB. Auth/patient endpoints will not work.");
  }

  // Load medicine index from CSV
  const csvPath = process.env["MEDICINES_CSV_PATH"] ??
    path.join(__dirname, "../data/medicines.csv");

  try {
    initMedicineIndex(csvPath);
    logger.info({ csvPath }, "Medicine index loaded");
  } catch (err) {
    logger.error({ err, csvPath }, "Failed to load medicine index");
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
