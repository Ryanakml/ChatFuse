import assert from 'node:assert/strict';
import { createApp } from './index.js';

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

console.log(`${color.cyan}API Endpoint Tests (E1)${color.reset}\n`);

const app = createApp(buildTestEnv());
const server = app.listen(0);

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object' && 'port' in address);

  const baseUrl = `http://127.0.0.1:${address.port}`;

  await runTest('GET /health returns 200', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  await runTest('GET /ready returns 200', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  await runTest('Webhook verification success', async () => {
    const res = await fetch(
      `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-123`,
    );

    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'challenge-123');
  });

  await runTest('Webhook verification fails with wrong token', async () => {
    const res = await fetch(
      `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123`,
    );

    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: 'Verification failed' });
  });

  await runTest('POST /webhook accepts payload', async () => {
    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ object: 'whatsapp_business_account' }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
} finally {
  server.close();

  console.log('\n' + '-'.repeat(40));

  if (failed === 0) {
    console.log(`${color.green}All tests passed${color.reset}`);
    process.exit(0);
  } else {
    console.error(`${color.red}${failed} test(s) failed${color.reset}`);
    process.exit(1);
  }
}
