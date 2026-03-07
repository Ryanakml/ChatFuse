export const configPackageName = '@wa-chat/config';
export const DEFAULT_WORKER_TRANSIENT_MAX_ATTEMPTS = 5;
export const DEFAULT_WORKER_PERMANENT_MAX_ATTEMPTS = 1;
export const DEFAULT_WORKER_RETRY_BACKOFF_DELAY_MS = 1_000;
export const DEFAULT_WORKER_RETRY_BACKOFF_JITTER = 0.2;
export const REQUIRED_ENV_VARS = [
    'NODE_ENV',
    'PORT',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'REDIS_URL',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_SERVICE_NAME',
];
export const OPTIONAL_ENV_VARS = [
    'LANGCHAIN_TRACING_V2',
    'LANGCHAIN_API_KEY',
    'ALLOW_INSECURE_HTTP',
    'TRUST_PROXY',
    'ADMIN_IP_ALLOWLIST',
    'ADMIN_RATE_LIMIT_WINDOW_MS',
    'ADMIN_RATE_LIMIT_MAX',
    'ADMIN_AUTH_HEADER',
    'ADMIN_ROLE_HEADER',
    'ADMIN_ALLOWED_ROLES',
    'WEBHOOK_IDEMPOTENCY_TTL_SECONDS',
    'WORKER_CONCURRENCY',
    'WORKER_JOB_TIMEOUT_MS',
    'WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS',
    'WORKER_RETRY_PERMANENT_MAX_ATTEMPTS',
    'WORKER_RETRY_BACKOFF_DELAY_MS',
    'WORKER_RETRY_BACKOFF_JITTER',
];
const parsePositiveInteger = (value, fallback, environmentVariableName) => {
    if (!value || value.trim() === '') {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${environmentVariableName} must be a positive integer`);
    }
    return parsed;
};
const parseJitter = (value, fallback, environmentVariableName) => {
    if (!value || value.trim() === '') {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error(`${environmentVariableName} must be a number between 0 and 1`);
    }
    return parsed;
};
export const resolveWorkerRetryPolicy = (env) => {
    const transientMaxAttempts = parsePositiveInteger(env.WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS, DEFAULT_WORKER_TRANSIENT_MAX_ATTEMPTS, 'WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS');
    const permanentMaxAttempts = parsePositiveInteger(env.WORKER_RETRY_PERMANENT_MAX_ATTEMPTS, DEFAULT_WORKER_PERMANENT_MAX_ATTEMPTS, 'WORKER_RETRY_PERMANENT_MAX_ATTEMPTS');
    const backoffDelayMs = parsePositiveInteger(env.WORKER_RETRY_BACKOFF_DELAY_MS, DEFAULT_WORKER_RETRY_BACKOFF_DELAY_MS, 'WORKER_RETRY_BACKOFF_DELAY_MS');
    const backoffJitter = parseJitter(env.WORKER_RETRY_BACKOFF_JITTER, DEFAULT_WORKER_RETRY_BACKOFF_JITTER, 'WORKER_RETRY_BACKOFF_JITTER');
    if (permanentMaxAttempts > transientMaxAttempts) {
        throw new Error('WORKER_RETRY_PERMANENT_MAX_ATTEMPTS cannot be greater than WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS');
    }
    return {
        transient: {
            maxAttempts: transientMaxAttempts,
            backoffDelayMs,
            backoffJitter,
        },
        permanent: {
            maxAttempts: permanentMaxAttempts,
        },
    };
};
export const validateEnv = (env) => {
    const missing = REQUIRED_ENV_VARS.filter((key) => {
        const value = env[key];
        return !value || value.trim() === '';
    });
    if (missing.length > 0) {
        throw new Error(`Missing required env vars: ${missing.join(', ')}`);
    }
    const runtimeEnv = {};
    for (const key of REQUIRED_ENV_VARS) {
        runtimeEnv[key] = env[key].trim();
    }
    for (const key of OPTIONAL_ENV_VARS) {
        const value = env[key];
        if (value && value.trim() !== '') {
            runtimeEnv[key] = value.trim();
        }
    }
    return runtimeEnv;
};
//# sourceMappingURL=index.js.map