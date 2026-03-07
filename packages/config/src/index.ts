export const configPackageName = '@wa-chat/config';

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
] as const;

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
] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];
export type OptionalEnvVar = (typeof OPTIONAL_ENV_VARS)[number];
export type RuntimeEnv = Record<RequiredEnvVar, string> & Partial<Record<OptionalEnvVar, string>>;

export const validateEnv = (env: Record<string, string | undefined>): RuntimeEnv => {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = env[key];
    return !value || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const runtimeEnv = {} as RuntimeEnv;

  for (const key of REQUIRED_ENV_VARS) {
    runtimeEnv[key] = env[key]!.trim();
  }

  for (const key of OPTIONAL_ENV_VARS) {
    const value = env[key];
    if (value && value.trim() !== '') {
      runtimeEnv[key] = value.trim();
    }
  }

  return runtimeEnv;
};
