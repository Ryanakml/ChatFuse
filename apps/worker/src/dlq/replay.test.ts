import assert from 'node:assert/strict';
import {
  DLQ_REPLAY_CONFIRM_TOKEN,
  evaluateDlqReplayCandidate,
  parseDlqReplayCliArgs,
  resolveReplayJobOptions,
  runDlqReplay,
} from './replay.js';
import { createIngressDlqJobPayload, createIngressJobPayload } from '@wa-chat/shared';

const color = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  process.stdout.write(`${color.cyan}RUN${color.reset} ${name} ... `);

  try {
    await fn();
    console.log(`${color.green}PASS${color.reset}`);
  } catch (error: unknown) {
    failed += 1;
    console.log(`${color.red}FAIL${color.reset}`);

    if (error instanceof Error) {
      console.log(`${color.dim}${error.message}${color.reset}`);
    } else {
      console.log(`${color.dim}${String(error)}${color.reset}`);
    }
  }
}

const createRuntimeEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  PORT: '3000',
  WHATSAPP_VERIFY_TOKEN: 'verify-token',
  WHATSAPP_APP_SECRET: 'app-secret',
  WHATSAPP_PHONE_NUMBER_ID: 'phone-number-id',
  WHATSAPP_ACCESS_TOKEN: 'access-token',
  OPENAI_API_KEY: 'openai-key',
  GEMINI_API_KEY: 'gemini-key',
  SUPABASE_URL: 'https://supabase.example.com',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  REDIS_URL: 'redis://localhost:6379',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  OTEL_SERVICE_NAME: 'wa-chat-worker-test',
  WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS: '5',
  WORKER_RETRY_PERMANENT_MAX_ATTEMPTS: '2',
  WORKER_RETRY_BACKOFF_DELAY_MS: '1000',
  WORKER_RETRY_BACKOFF_JITTER: '0.2',
});

const createValidDlqPayload = (failedAt: string) =>
  createIngressDlqJobPayload({
    eventKey: 'message:wamid-replay-001',
    originalJob: {
      id: 'ingress-job-1',
      name: 'ingress-webhook-event',
      queueName: 'wa-webhook-ingress',
      data: createIngressJobPayload({
        eventKey: 'message:wamid-replay-001',
        payload: {
          object: 'whatsapp_business_account',
        },
        receivedAt: '2026-03-07T10:00:00.000Z',
      }),
      attemptsMade: 5,
      maxAttempts: 5,
      timestamp: 1000,
      processedOn: 2000,
      finishedOn: 3000,
      retry: {
        attempts: 5,
        backoffType: 'exponential',
        backoffDelayMs: 1200,
        backoffJitter: 0.3,
      },
    },
    failure: {
      reason: 'transient_retries_exhausted',
      errorClass: 'transient',
      errorName: 'Error',
      errorMessage: 'downstream timeout',
      errorStack: null,
      failedAt,
    },
  });

console.log(`${color.cyan}DLQ Replay Tests (F3)${color.reset}\n`);

try {
  await runTest('parseDlqReplayCliArgs enforces confirmation and execution guardrails', () => {
    assert.throws(
      () =>
        parseDlqReplayCliArgs([
          '--job-id=123',
          '--actor=ops-user',
          '--reason=incident-123',
          '--confirm=WRONG',
        ]),
      /Replay requires --execute/,
    );

    assert.throws(
      () =>
        parseDlqReplayCliArgs([
          '--actor=ops-user',
          '--reason=incident-123',
          '--execute',
          `--confirm=${DLQ_REPLAY_CONFIRM_TOKEN}`,
        ]),
      /Replay requires --job-id, --event-key, or explicit --allow-bulk/,
    );
  });

  await runTest('parseDlqReplayCliArgs accepts explicit bulk replay options', () => {
    const parsed = parseDlqReplayCliArgs([
      '--allow-bulk',
      '--limit=7',
      '--actor=ops-user',
      '--reason=incident-123',
      '--execute',
      `--confirm=${DLQ_REPLAY_CONFIRM_TOKEN}`,
    ]);

    assert.equal(parsed.allowBulk, true);
    assert.equal(parsed.limit, 7);
    assert.equal(parsed.jobId, null);
  });

  await runTest('evaluateDlqReplayCandidate skips invalid payloads and old events', () => {
    const invalid = evaluateDlqReplayCandidate({
      rawData: {
        bad: 'payload',
      },
      eventKeyFilter: null,
      maxAgeMinutes: 60,
      nowMs: Date.parse('2026-03-07T11:00:00.000Z'),
    });
    assert.equal(invalid.skipReason, 'invalid_dlq_payload');

    const oldPayload = createValidDlqPayload('2026-03-01T00:00:00.000Z');
    const old = evaluateDlqReplayCandidate({
      rawData: oldPayload,
      eventKeyFilter: null,
      maxAgeMinutes: 60,
      nowMs: Date.parse('2026-03-07T11:00:00.000Z'),
    });
    assert.equal(old.skipReason, 'too_old');
  });

  await runTest('resolveReplayJobOptions prefers original retry context from DLQ payload', () => {
    const dlqPayload = createValidDlqPayload('2026-03-07T10:30:00.000Z');
    const options = resolveReplayJobOptions(dlqPayload, {
      transient: {
        maxAttempts: 9,
        backoffDelayMs: 2000,
        backoffJitter: 0.1,
      },
      permanent: {
        maxAttempts: 2,
      },
    });

    assert.equal(options.attempts, 5);
    assert.ok(options.backoff && typeof options.backoff === 'object');
    if (options.backoff && typeof options.backoff === 'object') {
      assert.equal(options.backoff.type, 'exponential');
      assert.equal(options.backoff.delay, 1200);
      assert.equal(options.backoff.jitter, 0.3);
    }
  });

  await runTest('runDlqReplay re-enqueues and removes a valid DLQ job', async () => {
    const added: Array<{ name: string; eventKey: string; attempts: number | undefined }> = [];
    let removed = false;

    const summary = await runDlqReplay({
      argv: [
        '--job-id=dlq-1',
        '--actor=ops-user',
        '--reason=incident-123',
        '--execute',
        `--confirm=${DLQ_REPLAY_CONFIRM_TOKEN}`,
      ],
      env: createRuntimeEnv(),
      nowMs: Date.parse('2026-03-07T11:00:00.000Z'),
      dlqQueue: {
        getJob: async () => ({
          id: 'dlq-1',
          data: createValidDlqPayload('2026-03-07T10:40:00.000Z'),
          remove: async () => {
            removed = true;
          },
        }),
        getJobs: async () => [],
        close: async () => undefined,
      },
      ingressQueue: {
        add: async (name, data, opts) => {
          added.push({
            name,
            eventKey: data.eventKey,
            attempts: typeof opts?.attempts === 'number' ? opts.attempts : undefined,
          });
        },
        close: async () => undefined,
      },
    });

    assert.deepEqual(summary, {
      inspected: 1,
      replayed: 1,
      skipped: 0,
      failed: 0,
    });
    assert.deepEqual(added, [
      {
        name: 'ingress-webhook-event',
        eventKey: 'message:wamid-replay-001',
        attempts: 5,
      },
    ]);
    assert.equal(removed, true);
  });
} finally {
  console.log('\n' + '-'.repeat(40));

  if (failed === 0) {
    console.log(`${color.green}All tests passed${color.reset}`);
    process.exit(0);
  } else {
    console.error(`${color.red}${failed} test(s) failed${color.reset}`);
    process.exit(1);
  }
}
