export declare const configPackageName = "@wa-chat/config";
export declare const REQUIRED_ENV_VARS: readonly ["NODE_ENV", "PORT", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REDIS_URL", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_SERVICE_NAME"];
export declare const OPTIONAL_ENV_VARS: readonly ["LANGCHAIN_TRACING_V2", "LANGCHAIN_API_KEY", "ALLOW_INSECURE_HTTP", "TRUST_PROXY", "ADMIN_IP_ALLOWLIST", "ADMIN_RATE_LIMIT_WINDOW_MS", "ADMIN_RATE_LIMIT_MAX", "ADMIN_AUTH_HEADER", "ADMIN_ROLE_HEADER", "ADMIN_ALLOWED_ROLES"];
export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];
export type OptionalEnvVar = (typeof OPTIONAL_ENV_VARS)[number];
export type RuntimeEnv = Record<RequiredEnvVar, string> & Partial<Record<OptionalEnvVar, string>>;
export declare const validateEnv: (env: Record<string, string | undefined>) => RuntimeEnv;
//# sourceMappingURL=index.d.ts.map