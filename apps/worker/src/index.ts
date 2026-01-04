import { Queue, Worker } from 'bullmq';
import * as dotenv from 'dotenv';
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(`Worker starting, connecting to Redis at ${REDIS_URL}...`);

const queueName = 'test-queue';

const myQueue = new Queue(queueName, {
  connection: {
    host: 'localhost',
    port: 6379,
  },
});

const worker = new Worker(
  queueName,
  async (job) => {
    console.log(`Processing job ${job.id}:`, job.data);
  },
  {
    connection: {
      host: 'localhost',
      port: 6379,
    },
  },
);

worker.on('ready', () => {
  console.log('Worker is ready and connected to Redis!');
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

console.log('Worker setup complete.');
