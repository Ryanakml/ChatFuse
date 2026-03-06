import express from 'express';
import dotenv from 'dotenv';
import { validateEnv } from '@wa-chat/config';
import { pathToFileURL } from 'node:url';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { Queue } from 'bullmq';
import { createClient } from 'redis';
const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;
const INGRESS_QUEUE_NAME = 'wa-webhook-ingress';
const INGRESS_JOB_NAME = 'ingress-webhook-event';
const parseNumber = (value, fallback) => {
    if (!value) {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const asRecord = (value) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return value;
    }
    return null;
};
const stableStringify = (value) => {
    if (value === null) {
        return 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }
    switch (typeof value) {
        case 'string':
            return JSON.stringify(value);
        case 'number':
        case 'boolean':
            return String(value);
        case 'object': {
            const record = asRecord(value);
            if (!record) {
                return 'null';
            }
            const keys = Object.keys(record).sort();
            const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
            return `{${entries.join(',')}}`;
        }
        default:
            return 'null';
    }
};
const extractWebhookEventKey = (payload) => {
    const eventParts = [];
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
        const entryRecord = asRecord(entry);
        if (!entryRecord) {
            continue;
        }
        const changes = Array.isArray(entryRecord.changes) ? entryRecord.changes : [];
        for (const change of changes) {
            const changeRecord = asRecord(change);
            const valueRecord = changeRecord ? asRecord(changeRecord.value) : null;
            if (!valueRecord) {
                continue;
            }
            const messages = Array.isArray(valueRecord.messages) ? valueRecord.messages : [];
            for (const message of messages) {
                const messageRecord = asRecord(message);
                if (messageRecord && typeof messageRecord.id === 'string') {
                    eventParts.push(`message:${messageRecord.id}`);
                }
            }
            const statuses = Array.isArray(valueRecord.statuses) ? valueRecord.statuses : [];
            for (const status of statuses) {
                const statusRecord = asRecord(status);
                if (statusRecord && typeof statusRecord.id === 'string') {
                    eventParts.push(`status:${statusRecord.id}`);
                }
            }
        }
    }
    if (eventParts.length > 0) {
        return eventParts.sort().join('|');
    }
    // Fallback keeps idempotency deterministic even for unexpected payload variants.
    const digest = createHash('sha256').update(stableStringify(payload)).digest('hex');
    return `payload:${digest}`;
};
const coerceJsonValue = (value) => {
    if (value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((entry) => coerceJsonValue(entry));
    }
    const record = asRecord(value);
    if (!record) {
        return null;
    }
    const jsonObject = {};
    for (const [key, entry] of Object.entries(record)) {
        jsonObject[key] = coerceJsonValue(entry);
    }
    return jsonObject;
};
export const createRedisIdempotencyStore = (redisUrl) => {
    const redis = createClient({ url: redisUrl });
    let connectPromise = null;
    const ensureConnected = async () => {
        if (redis.isOpen) {
            return;
        }
        if (!connectPromise) {
            connectPromise = redis
                .connect()
                .then(() => undefined)
                .finally(() => {
                connectPromise = null;
            });
        }
        await connectPromise;
    };
    return {
        setIfNotExists: async (key, ttlSeconds) => {
            await ensureConnected();
            const result = await redis.set(key, '1', {
                EX: ttlSeconds,
                NX: true,
            });
            return result === 'OK';
        },
        delete: async (key) => {
            await ensureConnected();
            await redis.del(key);
        },
    };
};
export const createBullMqIngressQueue = (redisUrl) => {
    const queue = new Queue(INGRESS_QUEUE_NAME, {
        connection: { url: redisUrl },
        defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: false,
        },
    });
    return {
        enqueue: async (job) => {
            await queue.add(INGRESS_JOB_NAME, job);
        },
    };
};
export const createApp = (runtimeEnv, options = {}) => {
    const env = validateEnv(runtimeEnv);
    const app = express();
    const isDevelopment = runtimeEnv.NODE_ENV === 'development';
    const allowInsecureHttp = runtimeEnv.ALLOW_INSECURE_HTTP === 'true';
    const trustProxy = runtimeEnv.TRUST_PROXY === 'true';
    const adminIpAllowlist = runtimeEnv.ADMIN_IP_ALLOWLIST
        ? runtimeEnv.ADMIN_IP_ALLOWLIST.split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
    const adminRateLimitWindowMs = parseNumber(runtimeEnv.ADMIN_RATE_LIMIT_WINDOW_MS, 60_000);
    const adminRateLimitMax = parseNumber(runtimeEnv.ADMIN_RATE_LIMIT_MAX, 30);
    const webhookBodyLimit = runtimeEnv.WEBHOOK_BODY_LIMIT || '256kb';
    const webhookRateLimitWindowMs = parseNumber(runtimeEnv.WEBHOOK_RATE_LIMIT_WINDOW_MS, 60_000);
    const webhookRateLimitMax = parseNumber(runtimeEnv.WEBHOOK_RATE_LIMIT_MAX, 120);
    const idempotencyTtlSeconds = options.idempotencyTtlSeconds ??
        parseNumber(runtimeEnv.WEBHOOK_IDEMPOTENCY_TTL_SECONDS, DEFAULT_IDEMPOTENCY_TTL_SECONDS);
    const idempotencyStore = options.idempotencyStore ?? createRedisIdempotencyStore(env.REDIS_URL);
    const ingressQueue = options.ingressQueue ?? createBullMqIngressQueue(env.REDIS_URL);
    const adminAuthHeader = runtimeEnv.ADMIN_AUTH_HEADER?.trim() || 'x-wa-user';
    const adminRoleHeader = runtimeEnv.ADMIN_ROLE_HEADER?.trim() || 'x-wa-role';
    const adminAllowedRoles = runtimeEnv.ADMIN_ALLOWED_ROLES
        ? runtimeEnv.ADMIN_ALLOWED_ROLES.split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : ['admin'];
    const adminRateLimitStore = new Map();
    const webhookRateLimitStore = new Map();
    const parseWebhookJson = express.json({
        limit: webhookBodyLimit,
        verify: (req, _res, buffer) => {
            req.rawBody = Buffer.from(buffer);
        },
    });
    app.set('trust proxy', trustProxy ? 1 : false);
    const normalizeIp = (ip) => ip.replace(/^::ffff:/, '');
    const isHttpsRequest = (req) => {
        const forwardedProto = req.headers['x-forwarded-proto'];
        if (typeof forwardedProto === 'string') {
            const proto = forwardedProto.split(',')[0] ?? '';
            return proto.trim() === 'https';
        }
        return req.secure;
    };
    const sendWebhookError = (res, status, code, message) => {
        res.status(status).json({
            error: {
                code,
                message,
            },
        });
    };
    const isValidWhatsappSignature = (rawBody, signatureHeader) => {
        if (!signatureHeader.startsWith('sha256=')) {
            return false;
        }
        const provided = signatureHeader.slice(7).trim();
        if (!provided) {
            return false;
        }
        const expected = createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex');
        const providedBuffer = Buffer.from(provided, 'utf8');
        const expectedBuffer = Buffer.from(expected, 'utf8');
        if (providedBuffer.length !== expectedBuffer.length) {
            return false;
        }
        return timingSafeEqual(providedBuffer, expectedBuffer);
    };
    const applyWebhookRateLimit = (req, res, next) => {
        const sourceIp = normalizeIp(req.ip || 'unknown');
        const now = Date.now();
        const current = webhookRateLimitStore.get(sourceIp);
        if (!current || now >= current.resetAt) {
            webhookRateLimitStore.set(sourceIp, { count: 1, resetAt: now + webhookRateLimitWindowMs });
            next();
            return;
        }
        current.count += 1;
        if (current.count > webhookRateLimitMax) {
            sendWebhookError(res, 429, 'RATE_LIMITED', 'Rate limit exceeded');
            return;
        }
        next();
    };
    app.use((req, res, next) => {
        if (isDevelopment || allowInsecureHttp || isHttpsRequest(req)) {
            next();
            return;
        }
        res.status(426).json({ error: 'HTTPS required' });
    });
    const enforceAdminAccess = (req, res, next) => {
        const ip = normalizeIp(req.ip || '');
        if (adminIpAllowlist.length > 0 && !adminIpAllowlist.includes(ip)) {
            res.status(403).json({ error: 'IP not allowed' });
            return;
        }
        const now = Date.now();
        const current = adminRateLimitStore.get(ip);
        if (!current || now >= current.resetAt) {
            adminRateLimitStore.set(ip, { count: 1, resetAt: now + adminRateLimitWindowMs });
        }
        else {
            current.count += 1;
            if (current.count > adminRateLimitMax) {
                res.status(429).json({ error: 'Rate limit exceeded' });
                return;
            }
        }
        const adminUser = req.header(adminAuthHeader);
        const adminRole = req.header(adminRoleHeader);
        if (!adminUser) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (!adminRole || !adminAllowedRoles.includes(adminRole)) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        next();
    };
    app.get('/health', (_req, res) => {
        res.json({ ok: true });
    });
    app.get('/ready', (_req, res) => {
        res.json({ ok: true });
    });
    app.get('/webhook', (req, res) => {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
            res.status(200).type('text/plain').send(String(challenge));
            return;
        }
        res.status(403).json({ error: 'Verification failed' });
    });
    app.post('/webhook', parseWebhookJson, applyWebhookRateLimit, async (req, res) => {
        const webhookRequest = req;
        const signatureHeader = req.header('x-hub-signature-256') || '';
        if (!webhookRequest.rawBody || !signatureHeader) {
            sendWebhookError(res, 401, 'INVALID_SIGNATURE', 'Missing WhatsApp signature');
            return;
        }
        if (!isValidWhatsappSignature(webhookRequest.rawBody, signatureHeader)) {
            sendWebhookError(res, 401, 'INVALID_SIGNATURE', 'Invalid WhatsApp signature');
            return;
        }
        const payload = req.body;
        if (typeof payload !== 'object' ||
            payload === null ||
            Array.isArray(payload) ||
            typeof payload.object !== 'string') {
            sendWebhookError(res, 400, 'MALFORMED_PAYLOAD', 'Invalid webhook payload');
            return;
        }
        const eventKey = extractWebhookEventKey(payload);
        const dedupeKey = `idempotency:webhook:${eventKey}`;
        const firstSeen = await idempotencyStore.setIfNotExists(dedupeKey, idempotencyTtlSeconds);
        if (!firstSeen) {
            res.status(200).json({ ok: true });
            return;
        }
        try {
            await ingressQueue.enqueue({
                eventKey,
                payload: coerceJsonValue(payload),
                receivedAt: new Date().toISOString(),
            });
        }
        catch {
            await idempotencyStore.delete(dedupeKey);
            sendWebhookError(res, 503, 'ENQUEUE_FAILED', 'Failed to enqueue webhook event');
            return;
        }
        res.status(200).json({ ok: true });
    });
    app.get('/admin/health', enforceAdminAccess, (_req, res) => {
        res.json({ ok: true });
    });
    app.use((error, req, res, next) => {
        if (req.path !== '/webhook') {
            next(error);
            return;
        }
        if (error.type === 'entity.too.large') {
            sendWebhookError(res, 413, 'PAYLOAD_TOO_LARGE', 'Webhook payload exceeds limit');
            return;
        }
        if (error instanceof SyntaxError || error.type === 'entity.parse.failed') {
            sendWebhookError(res, 400, 'MALFORMED_PAYLOAD', 'Invalid JSON payload');
            return;
        }
        next(error);
    });
    return app;
};
export const startServer = (runtimeEnv) => {
    const env = validateEnv(runtimeEnv);
    const port = Number(env.PORT);
    if (!Number.isFinite(port)) {
        throw new Error(`PORT must be a number, received "${env.PORT}"`);
    }
    const app = createApp(runtimeEnv);
    return app.listen(port, () => {
        console.log(`API listening on ${port}`);
    });
};
dotenv.config();
const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entrypointUrl === import.meta.url) {
    startServer(process.env);
}
//# sourceMappingURL=index.js.map