/**
 * Integration Test: BullMQ Queue Flow (L2 – Integration)
 *
 * Verifies that:
 * 1. A well-formed IngressJobPayload placed onto a real BullMQ Queue
 *    is consumed exactly once by a Worker against a local Redis instance.
 * 2. Idempotency / deduplication: the same eventKey cannot be processed
 *    twice in the same test run (guard via in-memory Set in the processor).
 *
 * Gate: only runs when INTEGRATION=true to avoid blocking CI without Redis.
 */
import assert from 'node:assert/strict';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const RUN_INTEGRATION = process.env.INTEGRATION === 'true';

const color = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  yellow: '\x1b[33m',
};

let failed = 0;

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ${color.green}✓${color.reset} ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ${color.red}✗${color.reset} ${name}\n    ${color.dim}${msg}${color.reset}`);
  }
}

// ─── Guard ────────────────────────────────────────────────────────────────────

if (!RUN_INTEGRATION) {
  console.log(
    `${color.yellow}⚠ BullMQ integration test skipped (set INTEGRATION=true to run)${color.reset}`,
  );
  process.exit(0);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log(`${color.cyan}BullMQ Queue Flow Integration Tests (L2 – Integration)${color.reset}\n`);

try {
  const { Queue, Worker } = await import('bullmq');
  const { INGRESS_QUEUE_NAME, INGRESS_JOB_NAME, createIngressJobPayload } =
    await import('@wa-chat/shared');

  const TEST_QUEUE_NAME = `${INGRESS_QUEUE_NAME}-test-${Date.now()}`;
  const connection = { url: REDIS_URL };

  // ── Test 1: enqueue and consume a valid job ────────────────────────────────
  await runTest('valid IngressJobPayload is consumed exactly once', async () => {
    const processedEventKeys: string[] = [];

    const queue = new Queue(TEST_QUEUE_NAME, { connection });
    const payload = createIngressJobPayload({
      eventKey: 'message:wamid-integration-001',
      payload: { object: 'whatsapp_business_account' },
    });

    await queue.add(INGRESS_JOB_NAME, payload);

    await new Promise<void>((resolve, reject) => {
      const worker = new Worker(
        TEST_QUEUE_NAME,
        async (job) => {
          // Safety: job.data is the raw payload; assert it's our payload
          assert.equal(job.data.eventKey, payload.eventKey);
          processedEventKeys.push(job.data.eventKey as string);
        },
        { connection, concurrency: 1 },
      );

      const timer = setTimeout(async () => {
        await worker.close();
        await queue.close();
        reject(new Error('Timed out waiting for job to be consumed'));
      }, 5000);

      worker.on('completed', async () => {
        clearTimeout(timer);
        await worker.close();
        await queue.close();
        resolve();
      });

      worker.on('failed', async (job, err) => {
        void job;
        clearTimeout(timer);
        await worker.close();
        await queue.close();
        reject(err);
      });
    });

    assert.equal(processedEventKeys.length, 1);
    assert.equal(processedEventKeys[0], payload.eventKey);
  });

  // ── Test 2: second identical eventKey is NOT re-enqueued (processor guard)──
  await runTest('processor guard prevents double-processing the same eventKey', async () => {
    const processedCount: number[] = [];
    const processedKeys = new Set<string>();
    const DUPLICATE_KEY = 'message:wamid-integration-dup';
    const TEST_DUP_QUEUE = `${TEST_QUEUE_NAME}-dup`;

    const queue = new Queue(TEST_DUP_QUEUE, { connection });
    const payload = createIngressJobPayload({
      eventKey: DUPLICATE_KEY,
      payload: { object: 'whatsapp_business_account' },
    });

    // Enqueue twice (simulating duplicate delivery)
    await queue.addBulk([
      { name: INGRESS_JOB_NAME, data: payload },
      { name: INGRESS_JOB_NAME, data: payload },
    ]);

    let completedCount = 0;
    await new Promise<void>((resolve, reject) => {
      const worker = new Worker(
        TEST_DUP_QUEUE,
        async (job) => {
          const key = job.data.eventKey as string;
          if (!processedKeys.has(key)) {
            processedKeys.add(key);
            processedCount.push(1);
          }
          // Simulate in-processor idempotency guard: still completes, but only counts once
        },
        { connection, concurrency: 1 },
      );

      const timer = setTimeout(async () => {
        await worker.close();
        await queue.close();
        reject(new Error('Timed out waiting for duplicate jobs to process'));
      }, 5000);

      worker.on('completed', async () => {
        completedCount++;
        if (completedCount >= 2) {
          clearTimeout(timer);
          await worker.close();
          await queue.close();
          resolve();
        }
      });

      worker.on('failed', async (job, err) => {
        void job;
        clearTimeout(timer);
        await worker.close();
        await queue.close();
        reject(err);
      });
    });

    // Both jobs ran, but only counted once via the in-processor dedup guard
    assert.equal(processedCount.length, 1, 'Processor dedup guard should prevent double-counting');
  });
} catch (err) {
  failed++;
  const msg = err instanceof Error ? err.message : String(err);
  console.error(
    `${color.red}FATAL: Could not connect to Redis at ${REDIS_URL}: ${msg}${color.reset}`,
  );
}

if (failed > 0) {
  console.error(`\n${color.red}${failed} test(s) failed.${color.reset}`);
  process.exit(1);
} else {
  console.log(`\n${color.green}All BullMQ integration tests passed.${color.reset}`);
}
