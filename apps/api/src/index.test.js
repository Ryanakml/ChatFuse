import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApp } from './index.js';
const color = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};
let failed = 0;
async function runTest(name, fn) {
    process.stdout.write(`${color.cyan}RUN${color.reset} ${name} ... `);
    try {
        await fn();
        console.log(`${color.green}PASS${color.reset}`);
    }
    catch (err) {
        failed++;
        console.log(`${color.red}FAIL${color.reset}`);
        if (err instanceof Error) {
            console.log(`${color.dim}${err.message}${color.reset}`);
        }
        else {
            console.log(`${color.dim}${String(err)}${color.reset}`);
        }
    }
}
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
const signBody = (body, secret) => {
    const digest = createHmac('sha256', secret).update(body).digest('hex');
    return `sha256=${digest}`;
};
async function withServer(envOverrides, fn) {
    const env = {
        ...buildTestEnv(),
        ...envOverrides,
    };
    const app = createApp(env);
    const server = app.listen(0);
    try {
        const address = server.address();
        assert.ok(address && typeof address === 'object' && 'port' in address);
        const baseUrl = `http://127.0.0.1:${address.port}`;
        return await fn(baseUrl, env);
    }
    finally {
        server.close();
    }
}
console.log(`${color.cyan}API Endpoint Tests (E1 + E2)${color.reset}\n`);
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
    await runTest('Webhook verification success', async () => {
        await withServer({}, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-123`);
            assert.equal(res.status, 200);
            assert.equal(await res.text(), 'challenge-123');
        });
    });
    await runTest('GET /webhook does not require signature header', async () => {
        await withServer({}, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=no-signature-needed`);
            assert.equal(res.status, 200);
            assert.equal(await res.text(), 'no-signature-needed');
        });
    });
    await runTest('GET /webhook is unaffected by POST body limit config', async () => {
        await withServer({ WEBHOOK_BODY_LIMIT: '1b' }, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=still-works`);
            assert.equal(res.status, 200);
            assert.equal(await res.text(), 'still-works');
        });
    });
    await runTest('Webhook verification fails with wrong token', async () => {
        await withServer({}, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123`);
            assert.equal(res.status, 403);
            assert.deepEqual(await res.json(), { error: 'Verification failed' });
        });
    });
    await runTest('POST /webhook accepts valid signed payload', async () => {
        await withServer({}, async (baseUrl, env) => {
            const payload = JSON.stringify({ object: 'whatsapp_business_account' });
            const res = await fetch(`${baseUrl}/webhook`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-hub-signature-256': signBody(payload, env.WHATSAPP_APP_SECRET),
                },
                body: payload,
            });
            assert.equal(res.status, 200);
            assert.deepEqual(await res.json(), { ok: true });
        });
    });
    await runTest('POST /webhook rejects missing signature header', async () => {
        await withServer({}, async (baseUrl) => {
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
        });
    });
    await runTest('POST /webhook rejects invalid signature', async () => {
        await withServer({}, async (baseUrl) => {
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
        });
    });
    await runTest('POST /webhook rejects malformed payload structure', async () => {
        await withServer({}, async (baseUrl, env) => {
            const payload = JSON.stringify({ foo: 'bar' });
            const res = await fetch(`${baseUrl}/webhook`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-hub-signature-256': signBody(payload, env.WHATSAPP_APP_SECRET),
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
        });
    });
    await runTest('POST /webhook rejects invalid JSON body', async () => {
        await withServer({}, async (baseUrl, env) => {
            const invalidJson = '{"object":';
            const res = await fetch(`${baseUrl}/webhook`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-hub-signature-256': signBody(invalidJson, env.WHATSAPP_APP_SECRET),
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
        });
    });
    await runTest('POST /webhook enforces body size limit', async () => {
        await withServer({ WEBHOOK_BODY_LIMIT: '32b' }, async (baseUrl, env) => {
            const payload = JSON.stringify({
                object: 'whatsapp_business_account',
                data: '1234567890123',
            });
            const res = await fetch(`${baseUrl}/webhook`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-hub-signature-256': signBody(payload, env.WHATSAPP_APP_SECRET),
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
        });
    });
    await runTest('POST /webhook applies source rate limiting', async () => {
        await withServer({ WEBHOOK_RATE_LIMIT_MAX: '2', WEBHOOK_RATE_LIMIT_WINDOW_MS: '60000' }, async (baseUrl, env) => {
            const payload = JSON.stringify({ object: 'whatsapp_business_account' });
            const headers = {
                'content-type': 'application/json',
                'x-hub-signature-256': signBody(payload, env.WHATSAPP_APP_SECRET),
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
        });
    });
}
finally {
    console.log('\n' + '-'.repeat(40));
    if (failed === 0) {
        console.log(`${color.green}All tests passed${color.reset}`);
        process.exit(0);
    }
    else {
        console.error(`${color.red}${failed} test(s) failed${color.reset}`);
        process.exit(1);
    }
}
//# sourceMappingURL=index.test.js.map