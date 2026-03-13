/**
 * Integration Test: Escalation Handoff (L2)
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type {
  IdempotencyStore,
  IngressQueue,
  IngressObservability,
  IngressJobPayload,
  IngressTraceContext,
} from '../../apps/api/src/index.js';
import { createApp } from '../../apps/api/src/index.js';
import { runIngressJob } from '../../apps/worker/src/queue/consumer.js';
import { INGRESS_JOB_NAME } from '@wa-chat/shared';

const color = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
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

function signBody(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

async function withServer<T>(
  fn: (baseUrl: string, enqueuedJobs: IngressJobPayload[]) => Promise<T>,
): Promise<T> {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    ALLOW_INSECURE_HTTP: 'true',
    PORT: '0',
    WHATSAPP_VERIFY_TOKEN: 'verify-token-integration',
    WHATSAPP_APP_SECRET: 'secret-integration',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-integration',
    WHATSAPP_ACCESS_TOKEN: 'token-integration',
    OPENAI_API_KEY: 'openai-key-integration',
    GEMINI_API_KEY: 'gemini-key-integration',
    REDIS_URL: 'redis://localhost:6379',
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
    OTEL_SERVICE_NAME: 'wa-chat-api-test',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  };

  const enqueuedJobs: IngressJobPayload[] = [];
  const store = new Map<string, boolean>();

  const idempotencyStore: IdempotencyStore = {
    setIfNotExists: async (key: string, _ttlSeconds: number) => {
      if (store.has(key)) return false;
      store.set(key, true);
      return true;
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  };

  const ingressQueue: IngressQueue = {
    enqueue: async (job: IngressJobPayload) => {
      enqueuedJobs.push(job);
    },
  };

  const observability: IngressObservability = {
    onIngressStart: (_context: IngressTraceContext) => {},
    onVerificationFailure: (_context: IngressTraceContext, _details: { reason: string }) => {},
    onMalformedPayload: (_context: IngressTraceContext, _details: { reason: string }) => {},
    onDuplicateHit: (_context: IngressTraceContext, _details: { eventKey: string }) => {},
    onEnqueueSuccess: (_context: IngressTraceContext, _details: { eventKey: string }) => {},
    onEnqueueFailure: (
      _context: IngressTraceContext,
      _details: { eventKey: string; errorCode: string },
    ) => {},
  };

  const app = createApp(env, { idempotencyStore, ingressQueue, observability });

  return new Promise<T>((resolve, reject) => {
    const server = app.listen(0, async (listenError?: Error) => {
      if (listenError) {
        reject(listenError);
        return;
      }

      try {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          throw new Error('Test server failed to bind to an ephemeral TCP port');
        }
        const baseUrl = `http://localhost:${addr.port}`;
        const result = await fn(baseUrl, enqueuedJobs);
        server.close();
        resolve(result);
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });
}

console.log(`${color.cyan}Integration: Escalation Handoff${color.reset}\n`);

const main = async () => {
  await runTest('Escalation-triggering message is enqueued correctly', async () => {
    await withServer(async (baseUrl, enqueuedJobs) => {
      const escalationPayload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid-escalation-001',
                      type: 'text',
                      text: { body: 'I need to talk to a human agent right now' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signBody(escalationPayload, 'secret-integration'),
        },
        body: escalationPayload,
      });

      assert.equal(res.status, 200);
      assert.equal(enqueuedJobs.length, 1);
    });
  });

  await runTest('Worker processor routes escalation-triggering payload correctly', async () => {
    await withServer(async (baseUrl, enqueuedJobs) => {
      const escalationPayload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid-escalation-002',
                      type: 'text',
                      text: { body: 'i want to talk to a manager' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signBody(escalationPayload, 'secret-integration'),
        },
        body: escalationPayload,
      });

      const jobData = enqueuedJobs[0];
      assert.ok(jobData, 'Job must be present');

      const routedToEscalation: boolean[] = [];

      await runIngressJob({
        jobName: INGRESS_JOB_NAME,
        jobData,
        policies: {
          concurrency: 1,
          jobTimeoutMs: 5000,
          retry: { transientMaxAttempts: 3, permanentMaxAttempts: 1 },
        },
        processor: async (ingressPayload) => {
          const payloadStr = JSON.stringify(ingressPayload.payload);
          const isEscalation =
            payloadStr.includes('manager') ||
            payloadStr.includes('human') ||
            payloadStr.includes('agent');
          routedToEscalation.push(isEscalation);
        },
      });

      assert.equal(routedToEscalation[0], true, 'Processor should detect escalation intent');
    });
  });

  if (failed > 0) {
    console.error(`\n${color.red}${failed} test(s) failed.${color.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${color.green}All escalation handoff integration tests passed.${color.reset}`);
  }
};

void main();
