/**
 * Secret Rotation Utility
 *
 * Provides a utility for validating and rotating secrets at runtime
 * without requiring a full process restart. Designed for use in
 * health checks, admin endpoints, and operations tooling.
 *
 * Rotation model:
 * - Secrets are loaded from environment on startup.
 * - `validateSecrets()` performs presence and format checks.
 * - `rotateSecret()` updates the in-memory env and fires a callback
 *   so dependant clients (e.g. Redis, Supabase) can be re-initialised.
 */
/** All secrets required for production operation. */
export declare const REQUIRED_SECRET_NAMES: readonly ["WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_VERIFY_TOKEN", "OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "REDIS_URL"];
export type SecretName = (typeof REQUIRED_SECRET_NAMES)[number];
export interface SecretRotationResult {
    /** Secrets that are present and non-empty. */
    valid: SecretName[];
    /** Secrets that are absent or empty. */
    missing: SecretName[];
    /** Overall pass/fail. */
    healthy: boolean;
}
/** Callback invoked after a secret is rotated. */
export type SecretRotatedCallback = (name: string, newValue: string) => void;
/**
 * Register a callback to be invoked whenever a secret is rotated.
 * Useful for re-initialising SDK clients that cached the old value.
 */
export declare function onSecretRotated(callback: SecretRotatedCallback): void;
/**
 * Check that all required secrets are present in the provided env map.
 * Returns a structured report rather than throwing, to allow callers to
 * surface the missing secrets in a health-check endpoint.
 */
export declare function validateSecrets(env: Record<string, string | undefined>): SecretRotationResult;
/**
 * Rotate a secret in the provided env map and notify registered callbacks.
 *
 * @param env   The mutable env object (typically `process.env`).
 * @param name  Name of the secret to rotate.
 * @param newValue  The new secret value. Must be non-empty.
 * @throws {Error} if newValue is empty.
 */
export declare function rotateSecret(env: Record<string, string | undefined>, name: string, newValue: string): void;
/**
 * Clear all rotation callbacks (useful in tests to reset state).
 */
export declare function clearRotationCallbacks(): void;
//# sourceMappingURL=secret-rotation.d.ts.map