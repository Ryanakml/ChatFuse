export declare const configPackageName = "@wa-chat/config";
export declare const DEFAULT_WORKER_TRANSIENT_MAX_ATTEMPTS = 5;
export declare const DEFAULT_WORKER_PERMANENT_MAX_ATTEMPTS = 1;
export declare const DEFAULT_WORKER_RETRY_BACKOFF_DELAY_MS = 1000;
export declare const DEFAULT_WORKER_RETRY_BACKOFF_JITTER = 0.2;
export declare const REQUIRED_ENV_VARS: readonly ["NODE_ENV", "PORT", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REDIS_URL", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_SERVICE_NAME"];
export declare const OPTIONAL_ENV_VARS: readonly ["LANGCHAIN_TRACING_V2", "LANGCHAIN_API_KEY", "ALLOW_INSECURE_HTTP", "TRUST_PROXY", "ADMIN_IP_ALLOWLIST", "ADMIN_RATE_LIMIT_WINDOW_MS", "ADMIN_RATE_LIMIT_MAX", "ADMIN_AUTH_HEADER", "ADMIN_ROLE_HEADER", "ADMIN_ALLOWED_ROLES", "WEBHOOK_IDEMPOTENCY_TTL_SECONDS", "WORKER_CONCURRENCY", "WORKER_JOB_TIMEOUT_MS", "WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS", "WORKER_RETRY_PERMANENT_MAX_ATTEMPTS", "WORKER_RETRY_BACKOFF_DELAY_MS", "WORKER_RETRY_BACKOFF_JITTER"];
export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];
export type OptionalEnvVar = (typeof OPTIONAL_ENV_VARS)[number];
export type RuntimeEnv = Record<RequiredEnvVar, string> & Partial<Record<OptionalEnvVar, string>>;
export type WorkerRetryPolicy = {
    transient: {
        maxAttempts: number;
        backoffDelayMs: number;
        backoffJitter: number;
    };
    permanent: {
        maxAttempts: number;
    };
};
export declare const resolveWorkerRetryPolicy: (env: {
    WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS?: string;
    WORKER_RETRY_PERMANENT_MAX_ATTEMPTS?: string;
    WORKER_RETRY_BACKOFF_DELAY_MS?: string;
    WORKER_RETRY_BACKOFF_JITTER?: string;
}) => WorkerRetryPolicy;
export declare const validateEnv: (env: Record<string, string | undefined>) => RuntimeEnv;
//# sourceMappingURL=index.d.ts.map