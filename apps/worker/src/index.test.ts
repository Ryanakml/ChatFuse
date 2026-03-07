import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { INGRESS_JOB_NAME, createIngressJobPayload } from '@wa-chat/shared';
import { DEFAULT_WORKER_CONCURRENCY, DEFAULT_WORKER_JOB_TIMEOUT_MS, resolveWorkerPolicies } from './index.js';
import { WorkerJobTimeoutError, runIngressJob } from './queue/consumer.js';

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

console.log(`${color.cyan}Worker Foundation Tests (F1)${color.reset}\n`);

try {
  await runTest('resolveWorkerPolicies uses defaults when optional env is not set', () => {
    const policies = resolveWorkerPolicies(policyDefaultsEnv);
    assert.equal(policies.concurrency, DEFAULT_WORKER_CONCURRENCY);
    assert.equal(policies.jobTimeoutMs, DEFAULT_WORKER_JOB_TIMEOUT_MS);
  });

  await runTest('resolveWorkerPolicies reads explicit worker policy values', () => {
    const policies = resolveWorkerPolicies({
      WORKER_CONCURRENCY: '5',
      WORKER_JOB_TIMEOUT_MS: '45000',
    });

    assert.equal(policies.concurrency, 5);
    assert.equal(policies.jobTimeoutMs, 45_000);
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
      policies: {
        concurrency: 1,
        jobTimeoutMs: 500,
      },
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
          policies: {
            concurrency: 1,
            jobTimeoutMs: 500,
          },
          processor: async () => undefined,
        }),
      /Unexpected ingress job name/,
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
          policies: {
            concurrency: 1,
            jobTimeoutMs: 500,
          },
          processor: async () => undefined,
        }),
      /Invalid ingress job payload/,
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
          policies: {
            concurrency: 1,
            jobTimeoutMs: 20,
          },
          processor: async () => {
            await wait(80);
          },
        }),
      (error: unknown) => error instanceof WorkerJobTimeoutError && error.timeoutMs === 20,
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
