/**
 * Integration Test: Webhook Ingest → Queue → Agent → Outbound Send (L2)
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
import { createDefaultProcessor } from '../../apps/worker/src/index.js';
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

function buildEnv(): NodeJS.ProcessEnv {
  return {
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
}

function signBody(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

async function withServer<T>(
  fn: (baseUrl: string, enqueuedJobs: IngressJobPayload[]) => Promise<T>,
): Promise<T> {
  const env = buildEnv();
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

console.log(`${color.cyan}Integration: Webhook Ingest -> Queue -> Outbound Send${color.reset}\n`);

const main = async () => {
  await runTest('POST /webhook with valid signature → 200 and job is enqueued', async () => {
    await withServer(async (baseUrl, enqueuedJobs) => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account' });
      const signature = signBody(payload, 'secret-integration');

      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
          'X-Correlation-ID': 'integration-correlation-001',
        },
        body: payload,
      });

      assert.equal(res.status, 200);
      assert.equal(enqueuedJobs.length, 1);
    });
  });

  await runTest('Enqueued job contains eventKey, traceId, and correlationId', async () => {
    await withServer(async (baseUrl, enqueuedJobs) => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account' });
      const signature = signBody(payload, 'secret-integration');

      await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
          'X-Correlation-ID': 'integration-correlation-002',
        },
        body: payload,
      });

      const job = enqueuedJobs[0];
      assert.ok(job, 'Job must be present');
      assert.ok(job.eventKey, 'eventKey must be present');
      assert.ok(job.traceContext, 'traceContext must be present');
      assert.ok(job.traceContext.traceId, 'traceId must be present');
      assert.equal(job.traceContext.correlationId, 'integration-correlation-002');
    });
  });

  await runTest('Default worker processor sends outbound WhatsApp message', async () => {
    await withServer(async (baseUrl, enqueuedJobs) => {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid-integration-001',
                      from: '628111222333',
                      type: 'text',
                      text: { body: 'hello from integration' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
      const signature = signBody(payload, 'secret-integration');

      await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      assert.equal(enqueuedJobs.length, 1);

      let calledUrl = '';
      let calledBody = '';

      const processor = createDefaultProcessor(
        {
          WHATSAPP_PHONE_NUMBER_ID: 'phone-integration',
          WHATSAPP_ACCESS_TOKEN: 'token-integration',
        },
        async (input, init) => {
          calledUrl = input;
          calledBody = init.body;
          return {
            ok: true,
            status: 200,
            text: async () => '{"messages":[{"id":"wamid.mock.outbound"}]}',
          };
        },
      );

      await runIngressJob({
        jobName: INGRESS_JOB_NAME,
        jobData: enqueuedJobs[0],
        policies: {
          concurrency: 1,
          jobTimeoutMs: 5000,
          retry: { transientMaxAttempts: 3, permanentMaxAttempts: 1 },
        },
        processor,
      });

      assert.equal(calledUrl, 'https://graph.facebook.com/v22.0/phone-integration/messages');
      const outboundPayload = JSON.parse(calledBody) as {
        to: string;
        text: { body: string };
      };
      assert.equal(outboundPayload.to, '628111222333');
      assert.match(outboundPayload.text.body, /hello from integration/);
    });
  });

  if (failed > 0) {
    console.error(`\n${color.red}${failed} test(s) failed.${color.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${color.green}All integration webhook-to-outbound tests passed.${color.reset}`);
  }
};

void main();
