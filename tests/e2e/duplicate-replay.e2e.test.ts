/**
 * E2E Test: Duplicate Message Replay (L2 – E2E)
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
  fn: (baseUrl: string, enqueuedJobs: IngressJobPayload[], duplicateHits: string[]) => Promise<T>,
): Promise<T> {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    ALLOW_INSECURE_HTTP: 'true',
    PORT: '0',
    WHATSAPP_VERIFY_TOKEN: 'verify-token-e2e',
    WHATSAPP_APP_SECRET: 'secret-e2e',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-e2e',
    WHATSAPP_ACCESS_TOKEN: 'token-e2e',
    OPENAI_API_KEY: 'openai-key-e2e',
    GEMINI_API_KEY: 'gemini-key-e2e',
    REDIS_URL: 'redis://localhost:6379',
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
    OTEL_SERVICE_NAME: 'wa-chat-api-test',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  };

  const enqueuedJobs: IngressJobPayload[] = [];
  const duplicateHits: string[] = [];
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
    onDuplicateHit: (_context: IngressTraceContext, details: { eventKey: string }) => {
      duplicateHits.push(details.eventKey);
    },
    onEnqueueSuccess: (_context: IngressTraceContext, _details: { eventKey: string }) => {},
    onEnqueueFailure: (
      _context: IngressTraceContext,
      _details: { eventKey: string; errorCode: string },
    ) => {},
  };

  const app = createApp(env, { idempotencyStore, ingressQueue, observability });

  return new Promise<T>((resolve, reject) => {
    const server = (app as ReturnType<(typeof import('express'))['default']>).listen(
      0,
      async () => {
        try {
          const addr = server.address() as { port: number };
          const baseUrl = `http://localhost:${addr.port}`;
          const result = await fn(baseUrl, enqueuedJobs, duplicateHits);
          server.close();
          resolve(result);
        } catch (err) {
          server.close();
          reject(err);
        }
      },
    );
  });
}

console.log(`${color.cyan}E2E: Duplicate Message Replay (L2 – E2E)${color.reset}\n`);

const main = async () => {
  await runTest('Second identical webhook is acknowledged but not enqueued twice', async () => {
    await withServer(async (baseUrl, enqueuedJobs, duplicateHits) => {
      const waPayload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [{ id: 'wamid-dup-001', type: 'text', text: { body: 'hello' } }],
                },
              },
            ],
          },
        ],
      });
      const signature = signBody(waPayload, 'secret-e2e');
      const headers = {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
      };

      const res1 = await fetch(`${baseUrl}/webhook`, { method: 'POST', headers, body: waPayload });
      assert.equal(res1.status, 200, 'First delivery should succeed with 200');
      assert.equal(enqueuedJobs.length, 1, 'First delivery must enqueue exactly 1 job');

      const res2 = await fetch(`${baseUrl}/webhook`, { method: 'POST', headers, body: waPayload });
      assert.equal(res2.status, 200, 'Duplicate delivery must still return 200 (ACK)');
      assert.equal(enqueuedJobs.length, 1, 'Duplicate must NOT enqueue a second job');
      assert.equal(duplicateHits.length, 1, 'Duplicate hit observability must be triggered once');
    });
  });

  await runTest('Different message IDs are enqueued independently', async () => {
    await withServer(async (baseUrl, enqueuedJobs) => {
      function makePayload(msgId: string) {
        return JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [{ id: msgId, type: 'text', text: { body: 'hello' } }],
                  },
                },
              ],
            },
          ],
        });
      }

      for (let i = 0; i < 3; i++) {
        const body = makePayload(`wamid-unique-${i}`);
        await fetch(`${baseUrl}/webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signBody(body, 'secret-e2e'),
          },
          body,
        });
      }

      assert.equal(enqueuedJobs.length, 3, 'Three distinct messages should create 3 jobs');
    });
  });

  if (failed > 0) {
    console.error(`\n${color.red}${failed} test(s) failed.${color.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${color.green}All duplicate replay E2E tests passed.${color.reset}`);
  }
};

void main();
