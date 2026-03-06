/* global fetch */
import assert from 'node:assert/strict';
import { createApp } from './index.js';
const buildTestEnv = () => ({
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
const app = createApp(buildTestEnv());
const server = app.listen(0);
try {
  const address = server.address();
  assert.ok(address && typeof address === 'object' && 'port' in address);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const healthResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { ok: true });
  const readyResponse = await fetch(`${baseUrl}/ready`);
  assert.equal(readyResponse.status, 200);
  assert.deepEqual(await readyResponse.json(), { ok: true });
  const webhookVerifyResponse = await fetch(
    `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-123`,
  );
  assert.equal(webhookVerifyResponse.status, 200);
  assert.equal(await webhookVerifyResponse.text(), 'challenge-123');
  const webhookVerifyFailResponse = await fetch(
    `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123`,
  );
  assert.equal(webhookVerifyFailResponse.status, 403);
  assert.deepEqual(await webhookVerifyFailResponse.json(), { error: 'Verification failed' });
  const webhookPostResponse = await fetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ object: 'whatsapp_business_account' }),
  });
  assert.equal(webhookPostResponse.status, 200);
  assert.deepEqual(await webhookPostResponse.json(), { ok: true });
  console.log('API endpoint tests passed');
} finally {
  server.close();
}
//# sourceMappingURL=index.test.js.map
