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
export const REQUIRED_SECRET_NAMES = [
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_VERIFY_TOKEN',
    'OPENAI_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'REDIS_URL',
];
const rotationCallbacks = [];
/**
 * Register a callback to be invoked whenever a secret is rotated.
 * Useful for re-initialising SDK clients that cached the old value.
 */
export function onSecretRotated(callback) {
    rotationCallbacks.push(callback);
}
/**
 * Check that all required secrets are present in the provided env map.
 * Returns a structured report rather than throwing, to allow callers to
 * surface the missing secrets in a health-check endpoint.
 */
export function validateSecrets(env) {
    const valid = [];
    const missing = [];
    for (const name of REQUIRED_SECRET_NAMES) {
        const value = env[name];
        if (value && value.trim().length > 0) {
            valid.push(name);
        }
        else {
            missing.push(name);
        }
    }
    return { valid, missing, healthy: missing.length === 0 };
}
/**
 * Rotate a secret in the provided env map and notify registered callbacks.
 *
 * @param env   The mutable env object (typically `process.env`).
 * @param name  Name of the secret to rotate.
 * @param newValue  The new secret value. Must be non-empty.
 * @throws {Error} if newValue is empty.
 */
export function rotateSecret(env, name, newValue) {
    if (!newValue || newValue.trim().length === 0) {
        throw new Error(`rotateSecret: new value for "${name}" must not be empty`);
    }
    env[name] = newValue;
    for (const callback of rotationCallbacks) {
        try {
            callback(name, newValue);
        }
        catch {
            // Callbacks must not crash the rotation process
        }
    }
}
/**
 * Clear all rotation callbacks (useful in tests to reset state).
 */
export function clearRotationCallbacks() {
    rotationCallbacks.length = 0;
}
//# sourceMappingURL=secret-rotation.js.map