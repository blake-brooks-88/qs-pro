/**
 * SSE Backfill Integration Tests
 *
 * Tests the SSE event persistence and backfill retrieval mechanism.
 *
 * Architecture:
 * - Worker (ShellQueryProcessor.publishStatusEvent): Encrypts and stores events to Redis
 * - API (ShellQuerySseService.streamRunEvents): Retrieves and decrypts cached events
 *
 * Test Strategy:
 * - Real Redis connection for event storage
 * - Direct encryption functions for encrypt/decrypt verification
 * - Direct Redis operations to verify storage format
 * - No internal mocks - only real infrastructure
 *
 * Covered Behaviors:
 * - Event caching with encryption at rest
 * - Event storage uses 24-hour TTL (86400 seconds)
 * - Encrypted events can be decrypted to valid JSON
 * - Multiple event types (ready, failed, canceled) stored correctly
 * - Event channel and last-event key follow naming convention
 */
import Redis from 'ioredis';
import { encrypt, decrypt } from '@qpp/database';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const LAST_EVENT_TTL_SECONDS = 86400;

/**
 * Helper to simulate the worker's publishStatusEvent behavior.
 * This mirrors the logic in ShellQueryProcessor.publishStatusEvent().
 */
async function simulatePublishStatusEvent(
  redis: Redis,
  encryptionKey: string,
  runId: string,
  status: string,
  errorMessage?: string,
): Promise<void> {
  const statusMessages: Record<string, string> = {
    queued: 'Query submitted...',
    creating_target: 'Creating target Data Extension...',
    creating_query: 'Creating query definition...',
    executing_query: 'Executing query...',
    polling: 'Waiting for results...',
    fetching_results: 'Fetching results...',
    ready: 'Query completed successfully',
    failed: 'Query execution failed',
    canceled: 'Query was canceled',
  };

  const statusMessage = statusMessages[status] ?? status;
  const event = {
    status,
    message:
      status === 'failed' && errorMessage
        ? `${statusMessage}: ${errorMessage}`
        : statusMessage,
    timestamp: new Date().toISOString(),
    runId,
    ...(errorMessage ? { errorMessage } : {}),
  };

  const channel = `run-status:${runId}`;
  const lastEventKey = `run-status:last:${runId}`;
  const eventJson = JSON.stringify(event);
  const encryptedEventJson = encrypt(eventJson, encryptionKey);

  await Promise.all([
    redis.publish(channel, encryptedEventJson),
    redis.set(lastEventKey, encryptedEventJson, 'EX', LAST_EVENT_TTL_SECONDS),
  ]);
}

describe('SSE Backfill (integration)', () => {
  let redis: Redis;
  const testRunIds: string[] = [];

  beforeAll(() => {
    redis = new Redis(REDIS_URL);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(() => {
    // Track run IDs for cleanup
    testRunIds.length = 0;
  });

  afterEach(async () => {
    // Clean up test keys
    const keysToDelete = testRunIds.flatMap((runId) => [
      `run-status:${runId}`,
      `run-status:last:${runId}`,
    ]);
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  });

  describe('Event persistence for reconnect backfill', () => {
    it('persists status event to Redis with 24h TTL when publishing', async () => {
      const runId = `test-run-ttl-${Date.now()}`;
      testRunIds.push(runId);

      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'executing_query',
      );

      const lastEventKey = `run-status:last:${runId}`;

      // Verify key exists
      const storedValue = await redis.get(lastEventKey);
      expect(storedValue).not.toBeNull();

      // Verify TTL is set (should be close to 86400)
      const ttl = await redis.ttl(lastEventKey);
      expect(ttl).toBeGreaterThan(86400 - 10); // Within 10 seconds of 24h
      expect(ttl).toBeLessThanOrEqual(86400);
    });

    it('encrypts event payload before storing in Redis', async () => {
      const runId = `test-run-encrypt-${Date.now()}`;
      testRunIds.push(runId);

      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'executing_query',
      );

      const lastEventKey = `run-status:last:${runId}`;
      const storedValue = await redis.get(lastEventKey);

      // Encrypted data should NOT be valid JSON (it's base64 encoded)
      expect(storedValue).not.toBeNull();
      expect(() => JSON.parse(storedValue!)).toThrow();

      // Encrypted data should NOT contain plaintext status
      expect(storedValue).not.toContain('executing_query');
      expect(storedValue).not.toContain(runId);
    });

    it('can decrypt stored event to valid JSON with correct status', async () => {
      const runId = `test-run-decrypt-${Date.now()}`;
      testRunIds.push(runId);

      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'ready',
      );

      const lastEventKey = `run-status:last:${runId}`;
      const storedValue = await redis.get(lastEventKey);

      // Decrypt the stored value
      const decrypted = decrypt(storedValue!, ENCRYPTION_KEY);
      expect(decrypted).toBeDefined();

      // Parse as JSON
      const event = JSON.parse(decrypted);
      expect(event.status).toBe('ready');
      expect(event.message).toBe('Query completed successfully');
      expect(event.runId).toBe(runId);
      expect(event.timestamp).toBeDefined();
    });

    it('persists terminal ready state to Redis', async () => {
      const runId = `test-run-ready-${Date.now()}`;
      testRunIds.push(runId);

      // Simulate the full workflow: queued -> executing -> ready
      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'queued',
      );
      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'executing_query',
      );
      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'ready',
      );

      const lastEventKey = `run-status:last:${runId}`;
      const storedValue = await redis.get(lastEventKey);
      const decrypted = decrypt(storedValue!, ENCRYPTION_KEY);
      const event = JSON.parse(decrypted);

      // Last event should be 'ready'
      expect(event.status).toBe('ready');
    });

    it('persists terminal failed state with error message to Redis', async () => {
      const runId = `test-run-failed-${Date.now()}`;
      testRunIds.push(runId);
      const errorMessage = 'Syntax error in query';

      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'failed',
        errorMessage,
      );

      const lastEventKey = `run-status:last:${runId}`;
      const storedValue = await redis.get(lastEventKey);
      const decrypted = decrypt(storedValue!, ENCRYPTION_KEY);
      const event = JSON.parse(decrypted);

      expect(event.status).toBe('failed');
      expect(event.errorMessage).toBe(errorMessage);
      expect(event.message).toContain(errorMessage);
    });

    it('persists canceled state to Redis', async () => {
      const runId = `test-run-canceled-${Date.now()}`;
      testRunIds.push(runId);

      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'canceled',
      );

      const lastEventKey = `run-status:last:${runId}`;
      const storedValue = await redis.get(lastEventKey);
      const decrypted = decrypt(storedValue!, ENCRYPTION_KEY);
      const event = JSON.parse(decrypted);

      expect(event.status).toBe('canceled');
      expect(event.message).toBe('Query was canceled');
    });

    it('uses correct key naming convention for channel and last event', async () => {
      const runId = `test-run-keys-${Date.now()}`;
      testRunIds.push(runId);

      // Subscribe to channel to verify naming
      const channelName = `run-status:${runId}`;
      const lastEventKeyName = `run-status:last:${runId}`;

      const subscriber = redis.duplicate();
      const receivedMessages: string[] = [];

      await new Promise<void>((resolve) => {
        subscriber.subscribe(channelName, () => {
          resolve();
        });
      });

      subscriber.on('message', (_channel, message) => {
        receivedMessages.push(message);
      });

      // Publish event
      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'queued',
      );

      // Wait for message to be received
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify channel received message
      expect(receivedMessages.length).toBe(1);

      // Verify last event key was set
      const storedValue = await redis.get(lastEventKeyName);
      expect(storedValue).not.toBeNull();

      await subscriber.unsubscribe(channelName);
      await subscriber.quit();
    });

    it('overwrites previous event when new event is published', async () => {
      const runId = `test-run-overwrite-${Date.now()}`;
      testRunIds.push(runId);
      const lastEventKey = `run-status:last:${runId}`;

      // Publish first event
      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'queued',
      );

      const firstValue = await redis.get(lastEventKey);
      const firstEvent = JSON.parse(decrypt(firstValue!, ENCRYPTION_KEY));
      expect(firstEvent.status).toBe('queued');

      // Publish second event
      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'executing_query',
      );

      const secondValue = await redis.get(lastEventKey);
      const secondEvent = JSON.parse(decrypt(secondValue!, ENCRYPTION_KEY));
      expect(secondEvent.status).toBe('executing_query');

      // First event is overwritten
      expect(secondEvent.status).not.toBe('queued');
    });
  });

  describe('Backfill retrieval', () => {
    it('returns cached last event for reconnecting client', async () => {
      const runId = `test-run-backfill-${Date.now()}`;
      testRunIds.push(runId);

      // Simulate worker having published a "ready" event
      await simulatePublishStatusEvent(
        redis,
        ENCRYPTION_KEY,
        runId,
        'ready',
      );

      // Simulate API retrieving backfill (as ShellQuerySseService does)
      const lastEventKey = `run-status:last:${runId}`;
      const cachedValue = await redis.get(lastEventKey);

      expect(cachedValue).not.toBeNull();

      // Decrypt (as ShellQuerySseService does)
      const decrypted = decrypt(cachedValue!, ENCRYPTION_KEY);
      const event = JSON.parse(decrypted);

      expect(event.status).toBe('ready');
      expect(event.runId).toBe(runId);
    });

    it('returns null when no cached event exists', async () => {
      const runId = `test-run-no-cache-${Date.now()}`;
      testRunIds.push(runId);

      const lastEventKey = `run-status:last:${runId}`;
      const cachedValue = await redis.get(lastEventKey);

      expect(cachedValue).toBeNull();
    });
  });
});
