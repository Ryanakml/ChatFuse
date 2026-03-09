/**
 * PII Masking Utility
 *
 * Provides functions to redact personally identifiable information (PII)
 * from log payloads, API responses, and any structured objects.
 *
 * Used in production log serializers and admin API response middleware.
 */
/** Fields whose values should be fully redacted */
export const PII_KEY_BLOCKLIST = new Set([
    'phone_number',
    'phoneNumber',
    'phone',
    'email',
    'display_name',
    'displayName',
    'name',
    'body', // message body
    'content', // knowledge chunk content
    'message', // generic message field
    'sender',
    'from',
    'to',
]);
/** Regex patterns that identify PII values regardless of key name */
const PHONE_REGEX = /(\+?\d[\s\-()*]*){7,15}/;
const EMAIL_REGEX = /[a-zA-Z0-9._%+]+[-a-zA-Z0-9._%+]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
export const MASKED_PHONE = '***PHONE***';
export const MASKED_EMAIL = '***EMAIL***';
export const MASKED_FIELD = '[REDACTED]';
/**
 * Determine whether a string value looks like a phone number.
 */
export function looksLikePhone(value) {
    return PHONE_REGEX.test(value);
}
/**
 * Determine whether a string value looks like an email address.
 */
export function looksLikeEmail(value) {
    return EMAIL_REGEX.test(value);
}
/**
 * Mask a single string value based on its content.
 * Returns the original value if it contains no detected PII patterns.
 */
export function maskString(value) {
    if (looksLikeEmail(value)) {
        return value.replace(EMAIL_REGEX, MASKED_EMAIL);
    }
    if (looksLikePhone(value)) {
        return value.replace(PHONE_REGEX, MASKED_PHONE);
    }
    return value;
}
/**
 * Deep-clone and redact PII from a structured object.
 *
 * Rules applied (in order):
 *  1. Keys in PII_KEY_BLOCKLIST → value replaced with MASKED_FIELD
 *  2. String values matching phone/email patterns → pattern replaced
 *  3. Nested objects and arrays are recursed into
 *
 * Does NOT mutate the original object.
 */
export function maskPii(value, depth = 0) {
    if (depth > 10) {
        // Safety limit to avoid infinite recursion on circular-ish structures
        return value;
    }
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value === 'string') {
        return maskString(value);
    }
    if (typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => maskPii(item, depth + 1));
    }
    const result = {};
    for (const [key, val] of Object.entries(value)) {
        if (PII_KEY_BLOCKLIST.has(key)) {
            result[key] = MASKED_FIELD;
        }
        else {
            result[key] = maskPii(val, depth + 1);
        }
    }
    return result;
}
//# sourceMappingURL=pii.js.map