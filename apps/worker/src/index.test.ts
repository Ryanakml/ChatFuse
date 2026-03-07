import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { UnrecoverableError } from 'bullmq';
import { INGRESS_JOB_NAME, createIngressJobPayload } from '@wa-chat/shared';
import {
  DEFAULT_WORKER_CONCURRENCY,
  DEFAULT_WORKER_JOB_TIMEOUT_MS,
  DEFAULT_WORKER_RETRY_PERMANENT_MAX_ATTEMPTS,
  DEFAULT_WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS,
  buildIngressDlqPayloadFromFailure,
  resolveWillRetry,
  resolveWorkerPolicies,
  routeFailedIngressJobToDlq,
} from './index.js';
import { WorkerJobTimeoutError, WorkerPermanentError, runIngressJob } from './queue/consumer.js';

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

const policyDefaultsEnv = {};
const createTestPolicies = (overrides?: {
  concurrency?: number;
  jobTimeoutMs?: number;
  transientMaxAttempts?: number;
  permanentMaxAttempts?: number;
}) => ({
  concurrency: overrides?.concurrency ?? 1,
  jobTimeoutMs: overrides?.jobTimeoutMs ?? 500,
  retry: {
    transientMaxAttempts: overrides?.transientMaxAttempts ?? 5,
    permanentMaxAttempts: overrides?.permanentMaxAttempts ?? 1,
  },
});

console.log(`${color.cyan}Worker Foundation + Retry + DLQ Tests (F1 + F2 + F3)${color.reset}\n`);

try {
  await runTest('resolveWorkerPolicies uses defaults when optional env is not set', () => {
    const policies = resolveWorkerPolicies(policyDefaultsEnv);
    assert.equal(policies.concurrency, DEFAULT_WORKER_CONCURRENCY);
    assert.equal(policies.jobTimeoutMs, DEFAULT_WORKER_JOB_TIMEOUT_MS);
    assert.equal(policies.retry.transientMaxAttempts, DEFAULT_WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS);
    assert.equal(policies.retry.permanentMaxAttempts, DEFAULT_WORKER_RETRY_PERMANENT_MAX_ATTEMPTS);
  });

  await runTest('resolveWorkerPolicies reads explicit worker policy values', () => {
    const policies = resolveWorkerPolicies({
      WORKER_CONCURRENCY: '5',
      WORKER_JOB_TIMEOUT_MS: '45000',
      WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS: '7',
      WORKER_RETRY_PERMANENT_MAX_ATTEMPTS: '2',
      WORKER_RETRY_BACKOFF_DELAY_MS: '1200',
      WORKER_RETRY_BACKOFF_JITTER: '0.35',
    });

    assert.equal(policies.concurrency, 5);
    assert.equal(policies.jobTimeoutMs, 45_000);
    assert.equal(policies.retry.transientMaxAttempts, 7);
    assert.equal(policies.retry.permanentMaxAttempts, 2);
  });

  await runTest('resolveWorkerPolicies rejects non-positive concurrency', () => {
    assert.throws(
      () =>
        resolveWorkerPolicies({
          WORKER_CONCURRENCY: '0',
        }),
      /WORKER_CONCURRENCY must be a positive integer/,
    );
  });

  await runTest('resolveWorkerPolicies rejects jitter values outside [0, 1]', () => {
    assert.throws(
      () =>
        resolveWorkerPolicies({
          WORKER_RETRY_BACKOFF_JITTER: '1.5',
        }),
      /WORKER_RETRY_BACKOFF_JITTER must be a number between 0 and 1/,
    );
  });

  await runTest('runIngressJob accepts a valid versioned payload', async () => {
    const payload = createIngressJobPayload({
      eventKey: 'message:wamid-001',
      payload: {
        object: 'whatsapp_business_account',
      },
      receivedAt: '2026-03-07T00:00:00.000Z',
    });

    let seenEventKey: string | null = null;
    await runIngressJob({
      jobName: INGRESS_JOB_NAME,
      jobData: payload,
      policies: createTestPolicies(),
      processor: async (jobPayload) => {
        seenEventKey = jobPayload.eventKey;
      },
    });

    assert.equal(seenEventKey, 'message:wamid-001');
  });

  await runTest('runIngressJob rejects unexpected job names', async () => {
    const payload = createIngressJobPayload({
      eventKey: 'message:wamid-002',
      payload: {
        object: 'whatsapp_business_account',
      },
    });

    await assert.rejects(
      () =>
        runIngressJob({
          jobName: 'wrong-job-name',
          jobData: payload,
          policies: createTestPolicies(),
          processor: async () => undefined,
        }),
      (error: unknown) =>
        error instanceof UnrecoverableError && /Unexpected ingress job name/.test(error.message),
    );
  });

  await runTest('runIngressJob rejects payloads with unsupported schema version', async () => {
    const invalidPayload = {
      schemaVersion: 999,
      eventKey: 'message:wamid-003',
      payload: {
        object: 'whatsapp_business_account',
      },
      receivedAt: '2026-03-07T00:00:00.000Z',
    };

    await assert.rejects(
      () =>
        runIngressJob({
          jobName: INGRESS_JOB_NAME,
          jobData: invalidPayload,
          policies: createTestPolicies(),
          processor: async () => undefined,
        }),
      (error: unknown) =>
        error instanceof UnrecoverableError && /Invalid ingress job payload/.test(error.message),
    );
  });

  await runTest('runIngressJob enforces worker timeout policy', async () => {
    await assert.rejects(
      () =>
        runIngressJob({
          jobName: INGRESS_JOB_NAME,
          jobData: createIngressJobPayload({
            eventKey: 'message:wamid-004',
            payload: {
              object: 'whatsapp_business_account',
            },
          }),
          policies: createTestPolicies({
            jobTimeoutMs: 20,
          }),
          processor: async () => {
            await wait(80);
          },
        }),
      (error: unknown) => error instanceof WorkerJobTimeoutError && error.timeoutMs === 20,
    );
  });

  await runTest('runIngressJob marks explicit permanent errors as unrecoverable', async () => {
    await assert.rejects(
      () =>
        runIngressJob({
          jobName: INGRESS_JOB_NAME,
          jobData: createIngressJobPayload({
            eventKey: 'message:wamid-005',
            payload: {
              object: 'whatsapp_business_account',
            },
          }),
          policies: createTestPolicies(),
          processor: async () => {
            throw new WorkerPermanentError('cannot recover from validation failure');
          },
        }),
      (error: unknown) =>
        error instanceof UnrecoverableError &&
        error.message === 'cannot recover from validation failure',
    );
  });

  await runTest('runIngressJob allows permanent errors to retry until permanent max attempts', async () => {
    const payload = createIngressJobPayload({
      eventKey: 'message:wamid-006',
      payload: {
        object: 'whatsapp_business_account',
      },
    });

    await assert.rejects(
      () =>
        runIngressJob({
          jobName: INGRESS_JOB_NAME,
          jobData: payload,
          attemptsMade: 0,
          policies: createTestPolicies({
            permanentMaxAttempts: 2,
            transientMaxAttempts: 5,
          }),
          processor: async () => {
            throw new WorkerPermanentError('permanent but one more attempt allowed');
          },
        }),
      (error: unknown) =>
        error instanceof WorkerPermanentError &&
        error.message === 'permanent but one more attempt allowed',
    );

    await assert.rejects(
      () =>
        runIngressJob({
          jobName: INGRESS_JOB_NAME,
          jobData: payload,
          attemptsMade: 1,
          policies: createTestPolicies({
            permanentMaxAttempts: 2,
            transientMaxAttempts: 5,
          }),
          processor: async () => {
            throw new WorkerPermanentError('permanent but one more attempt allowed');
          },
        }),
      (error: unknown) =>
        error instanceof UnrecoverableError &&
        error.message === 'permanent but one more attempt allowed',
    );
  });

  await runTest('runIngressJob keeps transient errors retryable', async () => {
    await assert.rejects(
      () =>
        runIngressJob({
          jobName: INGRESS_JOB_NAME,
          jobData: createIngressJobPayload({
            eventKey: 'message:wamid-007',
            payload: {
              object: 'whatsapp_business_account',
            },
          }),
          policies: createTestPolicies(),
          processor: async () => {
            throw new Error('temporary downstream outage');
          },
        }),
      (error: unknown) =>
        error instanceof Error &&
        !(error instanceof UnrecoverableError) &&
        error.message === 'temporary downstream outage',
    );
  });

  await runTest('resolveWillRetry applies class-specific attempt policies', () => {
    assert.equal(
      resolveWillRetry({
        errorClass: 'permanent',
        attemptsMade: 1,
        maxAttempts: 5,
        permanentMaxAttempts: 2,
      }),
      true,
    );
    assert.equal(
      resolveWillRetry({
        errorClass: 'permanent',
        attemptsMade: 2,
        maxAttempts: 5,
        permanentMaxAttempts: 2,
      }),
      false,
    );
    assert.equal(
      resolveWillRetry({
        errorClass: 'transient',
        attemptsMade: 5,
        maxAttempts: 5,
        permanentMaxAttempts: 2,
      }),
      false,
    );
    assert.equal(
      resolveWillRetry({
        errorClass: 'transient',
        attemptsMade: null,
        maxAttempts: 5,
        permanentMaxAttempts: 2,
      }),
      null,
    );
  });

  await runTest('buildIngressDlqPayloadFromFailure captures full failure context', () => {
    const payload = buildIngressDlqPayloadFromFailure({
      job: {
        id: 'job-1',
        name: INGRESS_JOB_NAME,
        queueName: 'wa-webhook-ingress',
        data: createIngressJobPayload({
          eventKey: 'message:wamid-dlq-001',
          payload: {
            object: 'whatsapp_business_account',
          },
          receivedAt: '2026-03-07T00:00:00.000Z',
        }),
        attemptsMade: 5,
        opts: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1200,
            jitter: 0.25,
          },
        },
        timestamp: 1_000,
        processedOn: 2_000,
        finishedOn: 3_000,
      },
      errorClass: 'transient',
      error: new Error('downstream unavailable'),
      failedAt: '2026-03-07T10:00:00.000Z',
    });

    assert.equal(payload.eventKey, 'message:wamid-dlq-001');
    assert.equal(payload.originalJob.id, 'job-1');
    assert.equal(payload.originalJob.attemptsMade, 5);
    assert.equal(payload.originalJob.maxAttempts, 5);
    assert.equal(payload.originalJob.retry.attempts, 5);
    assert.equal(payload.originalJob.retry.backoffType, 'exponential');
    assert.equal(payload.originalJob.retry.backoffDelayMs, 1200);
    assert.equal(payload.originalJob.retry.backoffJitter, 0.25);
    assert.equal(payload.failure.reason, 'transient_retries_exhausted');
    assert.equal(payload.failure.failedAt, '2026-03-07T10:00:00.000Z');
  });

  await runTest('routeFailedIngressJobToDlq routes exhausted transient failures', async () => {
    const capturedPayloads: { eventKey: string }[] = [];
    const result = await routeFailedIngressJobToDlq({
      job: {
        id: 'job-2',
        name: INGRESS_JOB_NAME,
        queueName: 'wa-webhook-ingress',
        data: createIngressJobPayload({
          eventKey: 'message:wamid-dlq-002',
          payload: {
            object: 'whatsapp_business_account',
          },
        }),
        attemptsMade: 5,
        opts: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1000,
            jitter: 0.2,
          },
        },
      },
      error: new Error('transient outage'),
      policies: createTestPolicies({
        permanentMaxAttempts: 2,
        transientMaxAttempts: 5,
      }),
      dlqQueue: {
        enqueue: async (payload) => {
          capturedPayloads.push({ eventKey: payload.eventKey });
          return 'dlq-job-2';
        },
        close: async () => undefined,
      },
      now: () => '2026-03-07T10:05:00.000Z',
    });

    assert.equal(result.willRetry, false);
    assert.equal(result.routedToDlq, true);
    assert.equal(result.dlqJobId, 'dlq-job-2');
    assert.equal(result.dlqRouteError, null);
    assert.deepEqual(capturedPayloads, [{ eventKey: 'message:wamid-dlq-002' }]);
  });

  await runTest('routeFailedIngressJobToDlq does not route retryable failures', async () => {
    let enqueueCalled = false;
    const result = await routeFailedIngressJobToDlq({
      job: {
        id: 'job-3',
        name: INGRESS_JOB_NAME,
        queueName: 'wa-webhook-ingress',
        data: createIngressJobPayload({
          eventKey: 'message:wamid-dlq-003',
          payload: {
            object: 'whatsapp_business_account',
          },
        }),
        attemptsMade: 1,
        opts: {
          attempts: 5,
        },
      },
      error: new Error('temporary timeout'),
      policies: createTestPolicies({
        permanentMaxAttempts: 2,
        transientMaxAttempts: 5,
      }),
      dlqQueue: {
        enqueue: async () => {
          enqueueCalled = true;
          return 'dlq-job-3';
        },
        close: async () => undefined,
      },
    });

    assert.equal(result.willRetry, true);
    assert.equal(result.routedToDlq, false);
    assert.equal(enqueueCalled, false);
  });

  await runTest('routeFailedIngressJobToDlq surfaces routing failures', async () => {
    const result = await routeFailedIngressJobToDlq({
      job: {
        id: 'job-4',
        name: INGRESS_JOB_NAME,
        queueName: 'wa-webhook-ingress',
        data: createIngressJobPayload({
          eventKey: 'message:wamid-dlq-004',
          payload: {
            object: 'whatsapp_business_account',
          },
        }),
        attemptsMade: 5,
        opts: {
          attempts: 5,
        },
      },
      error: new Error('final transient error'),
      policies: createTestPolicies({
        permanentMaxAttempts: 2,
        transientMaxAttempts: 5,
      }),
      dlqQueue: {
        enqueue: async () => {
          throw new Error('redis unavailable');
        },
        close: async () => undefined,
      },
    });

    assert.equal(result.willRetry, false);
    assert.equal(result.routedToDlq, false);
    assert.equal(result.dlqJobId, null);
    assert.equal(result.dlqRouteError, 'redis unavailable');
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
