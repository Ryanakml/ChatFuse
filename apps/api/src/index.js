import express from 'express';
import dotenv from 'dotenv';
import { validateEnv } from '@wa-chat/config';
import process from 'process';
import console from 'console';
dotenv.config();
const env = validateEnv(process.env);
const app = express();
const allowInsecureHttp = process.env.ALLOW_INSECURE_HTTP === 'true';
const trustProxy = process.env.TRUST_PROXY === 'true';
const adminIpAllowlist = process.env.ADMIN_IP_ALLOWLIST
  ? process.env.ADMIN_IP_ALLOWLIST.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  : [];
const parseNumber = (value, fallback) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const adminRateLimitWindowMs = parseNumber(process.env.ADMIN_RATE_LIMIT_WINDOW_MS, 60_000);
const adminRateLimitMax = parseNumber(process.env.ADMIN_RATE_LIMIT_MAX, 30);
const adminAuthHeader = process.env.ADMIN_AUTH_HEADER?.trim() || 'x-wa-user';
const adminRoleHeader = process.env.ADMIN_ROLE_HEADER?.trim() || 'x-wa-role';
const adminAllowedRoles = process.env.ADMIN_ALLOWED_ROLES
  ? process.env.ADMIN_ALLOWED_ROLES.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  : ['admin'];
const adminRateLimitStore = new Map();
app.set('trust proxy', trustProxy ? 1 : false);
app.use(express.json());
const normalizeIp = (ip) => ip.replace(/^::ffff:/, '');
const isHttpsRequest = (req) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    const proto = forwardedProto.split(',')[0] ?? '';
    return proto.trim() === 'https';
  }
  return req.secure;
};
app.use((req, res, next) => {
  if (allowInsecureHttp || isHttpsRequest(req)) {
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
app.get('/admin/health', enforceAdminAccess, (_req, res) => {
  res.json({ ok: true });
});
const port = Number(env.PORT);
if (!Number.isFinite(port)) {
  throw new Error(`PORT must be a number, received "${env.PORT}"`);
}
app.listen(port, () => {
  console.log(`API listening on ${port}`);
});
//# sourceMappingURL=index.js.map
