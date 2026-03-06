import express from 'express';
import dotenv from 'dotenv';
import { validateEnv } from '@wa-chat/config';
import { pathToFileURL } from 'node:url';
import { createHmac, timingSafeEqual } from 'node:crypto';

type WebhookRequest = express.Request & {
  rawBody?: Buffer;
};

export const createApp = (runtimeEnv: NodeJS.ProcessEnv) => {
  const env = validateEnv(runtimeEnv);
  const app = express();
  const isDevelopment = runtimeEnv.NODE_ENV === 'development';
  const allowInsecureHttp = runtimeEnv.ALLOW_INSECURE_HTTP === 'true';
  const trustProxy = runtimeEnv.TRUST_PROXY === 'true';
  const adminIpAllowlist = runtimeEnv.ADMIN_IP_ALLOWLIST
    ? runtimeEnv.ADMIN_IP_ALLOWLIST.split(',')
        .map((value: string) => value.trim())
        .filter(Boolean)
    : [];
  const parseNumber = (value: string | undefined, fallback: number) => {
    if (!value) {
      return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const adminRateLimitWindowMs = parseNumber(runtimeEnv.ADMIN_RATE_LIMIT_WINDOW_MS, 60_000);
  const adminRateLimitMax = parseNumber(runtimeEnv.ADMIN_RATE_LIMIT_MAX, 30);
  const webhookBodyLimit = runtimeEnv.WEBHOOK_BODY_LIMIT || '256kb';
  const webhookRateLimitWindowMs = parseNumber(runtimeEnv.WEBHOOK_RATE_LIMIT_WINDOW_MS, 60_000);
  const webhookRateLimitMax = parseNumber(runtimeEnv.WEBHOOK_RATE_LIMIT_MAX, 120);
  const adminAuthHeader = runtimeEnv.ADMIN_AUTH_HEADER?.trim() || 'x-wa-user';
  const adminRoleHeader = runtimeEnv.ADMIN_ROLE_HEADER?.trim() || 'x-wa-role';
  const adminAllowedRoles = runtimeEnv.ADMIN_ALLOWED_ROLES
    ? runtimeEnv.ADMIN_ALLOWED_ROLES.split(',')
        .map((value: string) => value.trim())
        .filter(Boolean)
    : ['admin'];
  const adminRateLimitStore = new Map<string, { count: number; resetAt: number }>();
  const webhookRateLimitStore = new Map<string, { count: number; resetAt: number }>();
  const parseWebhookJson: express.RequestHandler = express.json({
    limit: webhookBodyLimit,
    verify: (req, _res, buffer) => {
      (req as WebhookRequest).rawBody = Buffer.from(buffer);
    },
  });

  app.set('trust proxy', trustProxy ? 1 : false);

  const normalizeIp = (ip: string) => ip.replace(/^::ffff:/, '');

  const isHttpsRequest = (req: express.Request) => {
    const forwardedProto = req.headers['x-forwarded-proto'];
    if (typeof forwardedProto === 'string') {
      const proto = forwardedProto.split(',')[0] ?? '';
      return proto.trim() === 'https';
    }
    return req.secure;
  };

  const sendWebhookError = (
    res: express.Response,
    status: number,
    code: string,
    message: string,
  ) => {
    res.status(status).json({
      error: {
        code,
        message,
      },
    });
  };

  const isValidWhatsappSignature = (rawBody: Buffer, signatureHeader: string) => {
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

  const applyWebhookRateLimit: express.RequestHandler = (req, res, next) => {
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

  const enforceAdminAccess: express.RequestHandler = (req, res, next) => {
    const ip = normalizeIp(req.ip || '');
    if (adminIpAllowlist.length > 0 && !adminIpAllowlist.includes(ip)) {
      res.status(403).json({ error: 'IP not allowed' });
      return;
    }

    const now = Date.now();
    const current = adminRateLimitStore.get(ip);
    if (!current || now >= current.resetAt) {
      adminRateLimitStore.set(ip, { count: 1, resetAt: now + adminRateLimitWindowMs });
    } else {
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

  app.post('/webhook', parseWebhookJson, applyWebhookRateLimit, (req, res) => {
    const webhookRequest = req as WebhookRequest;
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
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      typeof payload.object !== 'string'
    ) {
      sendWebhookError(res, 400, 'MALFORMED_PAYLOAD', 'Invalid webhook payload');
      return;
    }

    res.status(200).json({ ok: true });
  });

  app.get('/admin/health', enforceAdminAccess, (_req, res) => {
    res.json({ ok: true });
  });

  app.use(
    (
      error: Error & { status?: number; type?: string },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
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
    },
  );

  return app;
};

export const startServer = (runtimeEnv: NodeJS.ProcessEnv) => {
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
