/**
 * PII Masking Utility
 *
 * Provides functions to redact personally identifiable information (PII)
 * from log payloads, API responses, and any structured objects.
 *
 * Used in production log serializers and admin API response middleware.
 */
/** Fields whose values should be fully redacted */
export declare const PII_KEY_BLOCKLIST: Set<string>;
export declare const MASKED_PHONE = "***PHONE***";
export declare const MASKED_EMAIL = "***EMAIL***";
export declare const MASKED_FIELD = "[REDACTED]";
/**
 * Determine whether a string value looks like a phone number.
 */
export declare function looksLikePhone(value: string): boolean;
/**
 * Determine whether a string value looks like an email address.
 */
export declare function looksLikeEmail(value: string): boolean;
/**
 * Mask a single string value based on its content.
 * Returns the original value if it contains no detected PII patterns.
 */
export declare function maskString(value: string): string;
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
export declare function maskPii(value: unknown, depth?: number): unknown;
//# sourceMappingURL=pii.d.ts.map