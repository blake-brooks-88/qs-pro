import { Queue, Worker } from "bullmq";
import * as dotenv from "dotenv";
dotenv.config();

const logger = {
  log: (msg: string) => process.stdout.write(`${msg}\n`),
  error: (msg: string, err?: unknown) =>
    process.stderr.write(`${msg} ${err}\n`),
};

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

logger.log(`Worker starting, connecting to Redis at ${REDIS_URL}...`);

const queueName = "test-queue";

new Queue(queueName, {
  connection: {
    host: "localhost",
    port: 6379,
  },
});

const worker = new Worker(
  queueName,
  async (job) => {
    logger.log(`Processing job ${job.id}: ${JSON.stringify(job.data)}`);
  },
  {
    connection: {
      host: "localhost",
      port: 6379,
    },
  },
);

worker.on("ready", () => {
  logger.log("Worker is ready and connected to Redis!");
});

worker.on("error", (err) => {
  logger.error("Worker error:", err);
});

logger.log("Worker setup complete.");
