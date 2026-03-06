import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type {
  IdempotencyStore,
  IngressJobPayload,
  IngressObservability,
  IngressQueue,
  IngressTraceContext,
} from './index.js';
import { createApp } from './index.js';

const color = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

let failed = 0;

type TestIngressDependencies = {
  idempotencyStore: IdempotencyStore;
  ingressQueue: IngressQueue;
  observability: IngressObservability;
  observabilityEvents: ObservabilityEvent[];
  enqueuedJobs: IngressJobPayload[];
};

type ObservabilityEvent =
  | { type: 'ingress_start'; context: IngressTraceContext }
  | { type: 'verification_failure'; context: IngressTraceContext; reason: string }
  | { type: 'malformed_payload'; context: IngressTraceContext; reason: string }
  | { type: 'duplicate_hit'; context: IngressTraceContext; eventKey: string }
  | { type: 'enqueue_success'; context: IngressTraceContext; eventKey: string }
  | { type: 'enqueue_failure'; context: IngressTraceContext; eventKey: string; errorCode: string };

const getObservabilityEvents = <T extends ObservabilityEvent['type']>(
  events: ObservabilityEvent[],
  type: T,
): Extract<ObservabilityEvent, { type: T }>[] =>
  events.filter((event): event is Extract<ObservabilityEvent, { type: T }> => event.type === type);

async function runTest(name: string, fn: () => Promise<void> | void) {
  process.stdout.write(`${color.cyan}RUN${color.reset} ${name} ... `);

  try {
    await fn();
    console.log(`${color.green}PASS${color.reset}`);
  } catch (err: unknown) {
    failed++;
    console.log(`${color.red}FAIL${color.reset}`);

    if (err instanceof Error) {
      console.log(`${color.dim}${err.message}${color.reset}`);
    } else {
      console.log(`${color.dim}${String(err)}${color.reset}`);
    }
  }
}

const buildTestEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  PORT: '3001',
  WHATSAPP_VERIFY_TOKEN: 'verify-token',
  WHATSAPP_APP_SECRET: 'app-secret',
  WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
  WHATSAPP_ACCESS_TOKEN: 'access-token',
  OPENAI_API_KEY: 'openai-key',
  GEMINI_API_KEY: 'gemini-key',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  REDIS_URL: 'redis://localhost:6379',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  OTEL_SERVICE_NAME: 'wa-chat-api',
  ALLOW_INSECURE_HTTP: 'true',
});

const signBody = (body: string, secret: string) => {
  const digest = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${digest}`;
};

async function withServer<T>(
  envOverrides: Partial<NodeJS.ProcessEnv>,
  fn: (baseUrl: string, env: NodeJS.ProcessEnv, deps: TestIngressDependencies) => Promise<T>,
) {
  const env = {
    ...buildTestEnv(),
    ...envOverrides,
  };

  const enqueuedJobs: IngressJobPayload[] = [];
  const seenIdempotencyKeys = new Set<string>();
  const observabilityEvents: ObservabilityEvent[] = [];

  const deps: TestIngressDependencies = {
    idempotencyStore: {
      setIfNotExists: async (key) => {
        if (seenIdempotencyKeys.has(key)) {
          return false;
        }

        seenIdempotencyKeys.add(key);
        return true;
      },
      delete: async (key) => {
        seenIdempotencyKeys.delete(key);
      },
    },
    ingressQueue: {
      enqueue: async (job) => {
        enqueuedJobs.push(job);
      },
    },
    observability: {
      onIngressStart: (context) => {
        observabilityEvents.push({
          type: 'ingress_start',
          context: { ...context },
        });
      },
      onVerificationFailure: (context, details) => {
        observabilityEvents.push({
          type: 'verification_failure',
          context: { ...context },
          reason: details.reason,
        });
      },
      onMalformedPayload: (context, details) => {
        observabilityEvents.push({
          type: 'malformed_payload',
          context: { ...context },
          reason: details.reason,
        });
      },
      onDuplicateHit: (context, details) => {
        observabilityEvents.push({
          type: 'duplicate_hit',
          context: { ...context },
          eventKey: details.eventKey,
        });
      },
      onEnqueueSuccess: (context, details) => {
        observabilityEvents.push({
          type: 'enqueue_success',
          context: { ...context },
          eventKey: details.eventKey,
        });
      },
      onEnqueueFailure: (context, details) => {
        observabilityEvents.push({
          type: 'enqueue_failure',
          context: { ...context },
          eventKey: details.eventKey,
          errorCode: details.errorCode,
        });
      },
    },
    observabilityEvents,
    enqueuedJobs,
  };

  const app = createApp(env, {
    idempotencyStore: deps.idempotencyStore,
    ingressQueue: deps.ingressQueue,
    observability: deps.observability,
    idempotencyTtlSeconds: 300,
  });
  const server = app.listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object' && 'port' in address);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return await fn(baseUrl, env, deps);
  } finally {
    server.close();
  }
}

console.log(`${color.cyan}API Endpoint Tests (E1 + E2 + E3 + E4)${color.reset}\n`);

try {
  await runTest('GET /health returns 200', async () => {
    await withServer({}, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
    });
  });

  await runTest('GET /ready returns 200', async () => {
    await withServer({}, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/ready`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
    });
  });

  await runTest('HTTP requests pass in development without ALLOW_INSECURE_HTTP', async () => {
    await withServer(
      {
        NODE_ENV: 'development',
        ALLOW_INSECURE_HTTP: 'false',
      },
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/health`);
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { ok: true });
      },
    );
  });

  await runTest(
    'HTTP requests are blocked outside development when ALLOW_INSECURE_HTTP is false',
    async () => {
      await withServer(
        {
          NODE_ENV: 'production',
          ALLOW_INSECURE_HTTP: 'false',
        },
        async (baseUrl) => {
          const res = await fetch(`${baseUrl}/health`);
          assert.equal(res.status, 426);
          assert.deepEqual(await res.json(), { error: 'HTTPS required' });
        },
      );
    },
  );

  await runTest('Webhook verification success', async () => {
    await withServer({}, async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-123`,
      );

      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'challenge-123');
    });
  });

  await runTest('GET /webhook does not require signature header', async () => {
    await withServer({}, async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=no-signature-needed`,
      );

      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'no-signature-needed');
    });
  });

  await runTest('GET /webhook is unaffected by POST body limit config', async () => {
    await withServer({ WEBHOOK_BODY_LIMIT: '1b' }, async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=still-works`,
      );

      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'still-works');
    });
  });

  await runTest('Webhook verification fails with wrong token', async () => {
    await withServer({}, async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123`,
      );

      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { error: 'Verification failed' });
    });
  });

  await runTest('POST /webhook accepts valid signed payload', async () => {
    await withServer({}, async (baseUrl, env, deps) => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account' });
      const correlationId = 'test-correlation-id';
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': correlationId,
          'x-hub-signature-256': signBody(payload, env.WHATSAPP_APP_SECRET!),
        },
        body: payload,
      });

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(res.headers.get('x-correlation-id'), correlationId);
      assert.equal(deps.enqueuedJobs.length, 1);
      assert.equal(typeof deps.enqueuedJobs[0]?.eventKey, 'string');

      const ingressEvents = getObservabilityEvents(deps.observabilityEvents, 'ingress_start');
      assert.equal(ingressEvents.length, 1);
      assert.equal(ingressEvents[0]?.context.correlationId, correlationId);
      assert.match(ingressEvents[0]?.context.traceId || '', /^[a-f0-9]{32}$/);

      const enqueueSuccessEvents = getObservabilityEvents(deps.observabilityEvents, 'enqueue_success');
      assert.equal(enqueueSuccessEvents.length, 1);
      assert.equal(typeof enqueueSuccessEvents[0]?.eventKey, 'string');
    });
  });

  await runTest('POST /webhook rejects missing signature header', async () => {
    await withServer({}, async (baseUrl, _env, deps) => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account' });
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      });

      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), {
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Missing WhatsApp signature',
        },
      });

      const verificationFailureEvents = getObservabilityEvents(
        deps.observabilityEvents,
        'verification_failure',
      );
      assert.equal(verificationFailureEvents.length, 1);
      assert.equal(verificationFailureEvents[0]?.reason, 'missing_signature');
    });
  });

  await runTest('POST /webhook rejects invalid signature', async () => {
    await withServer({}, async (baseUrl, _env, deps) => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account' });
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': 'sha256=invalid-signature',
        },
        body: payload,
      });

      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), {
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Invalid WhatsApp signature',
        },
      });

      const verificationFailureEvents = getObservabilityEvents(
        deps.observabilityEvents,
        'verification_failure',
      );
      assert.equal(verificationFailureEvents.length, 1);
      assert.equal(verificationFailureEvents[0]?.reason, 'invalid_signature');
    });
  });

  await runTest('POST /webhook rejects malformed payload structure', async () => {
    await withServer({}, async (baseUrl, env, deps) => {
      const payload = JSON.stringify({ foo: 'bar' });
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signBody(payload, env.WHATSAPP_APP_SECRET!),
        },
        body: payload,
      });

      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), {
        error: {
          code: 'MALFORMED_PAYLOAD',
          message: 'Invalid webhook payload',
        },
      });

      const malformedPayloadEvents = getObservabilityEvents(deps.observabilityEvents, 'malformed_payload');
      assert.equal(malformedPayloadEvents.length, 1);
      assert.equal(malformedPayloadEvents[0]?.reason, 'invalid_structure');
    });
  });

  await runTest('POST /webhook rejects invalid JSON body', async () => {
    await withServer({}, async (baseUrl, env, deps) => {
      const invalidJson = '{"object":';
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signBody(invalidJson, env.WHATSAPP_APP_SECRET!),
        },
        body: invalidJson,
      });

      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), {
        error: {
          code: 'MALFORMED_PAYLOAD',
          message: 'Invalid JSON payload',
        },
      });

      const malformedPayloadEvents = getObservabilityEvents(deps.observabilityEvents, 'malformed_payload');
      assert.equal(malformedPayloadEvents.length, 1);
      assert.equal(malformedPayloadEvents[0]?.reason, 'invalid_json');
    });
  });

  await runTest('POST /webhook enforces body size limit', async () => {
    await withServer({ WEBHOOK_BODY_LIMIT: '32b' }, async (baseUrl, env, deps) => {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        data: '1234567890123',
      });
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signBody(payload, env.WHATSAPP_APP_SECRET!),
        },
        body: payload,
      });

      assert.equal(res.status, 413);
      assert.deepEqual(await res.json(), {
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Webhook payload exceeds limit',
        },
      });

      const malformedPayloadEvents = getObservabilityEvents(deps.observabilityEvents, 'malformed_payload');
      assert.equal(malformedPayloadEvents.length, 1);
      assert.equal(malformedPayloadEvents[0]?.reason, 'payload_too_large');
    });
  });

  await runTest('POST /webhook applies source rate limiting', async () => {
    await withServer(
      { WEBHOOK_RATE_LIMIT_MAX: '2', WEBHOOK_RATE_LIMIT_WINDOW_MS: '60000' },
      async (baseUrl, env) => {
        const payload = JSON.stringify({ object: 'whatsapp_business_account' });
        const headers = {
          'content-type': 'application/json',
          'x-hub-signature-256': signBody(payload, env.WHATSAPP_APP_SECRET!),
        };

        const first = await fetch(`${baseUrl}/webhook`, { method: 'POST', headers, body: payload });
        const second = await fetch(`${baseUrl}/webhook`, {
          method: 'POST',
          headers,
          body: payload,
        });
        const third = await fetch(`${baseUrl}/webhook`, { method: 'POST', headers, body: payload });

        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.equal(third.status, 429);
        assert.deepEqual(await third.json(), {
          error: {
            code: 'RATE_LIMITED',
            message: 'Rate limit exceeded',
          },
        });
      },
    );
  });

  await runTest('POST /webhook dedupes duplicate events and enqueues once', async () => {
    await withServer({}, async (baseUrl, env, deps) => {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [{ id: 'wamid-123' }],
                },
              },
            ],
          },
        ],
      });
      const headers = {
        'content-type': 'application/json',
        'x-hub-signature-256': signBody(payload, env.WHATSAPP_APP_SECRET!),
      };

      const first = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers,
        body: payload,
      });
      const second = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers,
        body: payload,
      });

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(deps.enqueuedJobs.length, 1);
      assert.equal(deps.enqueuedJobs[0]?.eventKey, 'message:wamid-123');

      const duplicateHitEvents = getObservabilityEvents(deps.observabilityEvents, 'duplicate_hit');
      assert.equal(duplicateHitEvents.length, 1);
      assert.equal(duplicateHitEvents[0]?.eventKey, 'message:wamid-123');
    });
  });

  await runTest('POST /webhook records enqueue failure metrics', async () => {
    await withServer({}, async (baseUrl, env, deps) => {
      deps.ingressQueue.enqueue = async () => {
        throw new Error('queue unavailable');
      };

      const payload = JSON.stringify({ object: 'whatsapp_business_account' });
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signBody(payload, env.WHATSAPP_APP_SECRET!),
        },
        body: payload,
      });

      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), {
        error: {
          code: 'ENQUEUE_FAILED',
          message: 'Failed to enqueue webhook event',
        },
      });

      const enqueueFailureEvents = getObservabilityEvents(deps.observabilityEvents, 'enqueue_failure');
      assert.equal(enqueueFailureEvents.length, 1);
      assert.equal(enqueueFailureEvents[0]?.errorCode, 'ENQUEUE_FAILED');
    });
  });

  await runTest('POST /webhook ACK p95 remains under 1.5s (smoke)', async () => {
    await withServer({}, async (baseUrl, env) => {
      const latenciesMs: number[] = [];

      for (let index = 0; index < 40; index += 1) {
        const payload = JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [{ id: `wamid-latency-${index}` }],
                  },
                },
              ],
            },
          ],
        });

        const startedAt = Date.now();
        const res = await fetch(`${baseUrl}/webhook`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-hub-signature-256': signBody(payload, env.WHATSAPP_APP_SECRET!),
          },
          body: payload,
        });
        const elapsedMs = Date.now() - startedAt;

        assert.equal(res.status, 200);
        latenciesMs.push(elapsedMs);
      }

      const ordered = [...latenciesMs].sort((left, right) => left - right);
      const percentileIndex = Math.max(0, Math.ceil(ordered.length * 0.95) - 1);
      const p95 = ordered[percentileIndex];
      assert.ok(typeof p95 === 'number');
      assert.ok(p95 <= 1_500, `Expected ACK p95 <= 1500ms, received ${p95}ms`);
    });
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
