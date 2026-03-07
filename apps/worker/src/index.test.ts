import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { UnrecoverableError } from 'bullmq';
import { INGRESS_JOB_NAME, createIngressJobPayload } from '@wa-chat/shared';
import {
  DEFAULT_WORKER_CONCURRENCY,
  DEFAULT_WORKER_JOB_TIMEOUT_MS,
  DEFAULT_WORKER_RETRY_PERMANENT_MAX_ATTEMPTS,
  DEFAULT_WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS,
  resolveWorkerPolicies,
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

console.log(`${color.cyan}Worker Foundation + Retry Tests (F1 + F2)${color.reset}\n`);

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
