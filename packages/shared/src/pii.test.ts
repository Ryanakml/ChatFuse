import { describe, it, expect } from 'vitest';
import {
  maskPii,
  maskString,
  looksLikePhone,
  looksLikeEmail,
  MASKED_FIELD,
  MASKED_PHONE,
  MASKED_EMAIL,
} from './pii.js';

describe('looksLikePhone', () => {
  it('detects plain phone numbers', () => {
    expect(looksLikePhone('08123456789')).toBe(true);
    expect(looksLikePhone('+628123456789')).toBe(true);
    expect(looksLikePhone('+1 (555) 123-4567')).toBe(true);
  });

  it('does not flag short digit sequences', () => {
    expect(looksLikePhone('123')).toBe(false);
    expect(looksLikePhone('42')).toBe(false);
  });
});

describe('looksLikeEmail', () => {
  it('detects email addresses', () => {
    expect(looksLikeEmail('user@example.com')).toBe(true);
    expect(looksLikeEmail('support+tag@company.org')).toBe(true);
  });

  it('does not flag non-email strings', () => {
    expect(looksLikeEmail('hello world')).toBe(false);
    expect(looksLikeEmail('price: $10.99')).toBe(false);
  });
});

describe('maskString', () => {
  it('masks email addresses', () => {
    const result = maskString('Contact user@example.com for info');
    expect(result).toContain(MASKED_EMAIL);
    expect(result).not.toContain('user@example.com');
  });

  it('masks phone numbers', () => {
    const result = maskString('Call +628123456789 now');
    expect(result).toContain(MASKED_PHONE);
    expect(result).not.toContain('+628123456789');
  });

  it('returns non-PII strings unchanged', () => {
    expect(maskString('hello world')).toBe('hello world');
    expect(maskString('order status: shipped')).toBe('order status: shipped');
  });
});

describe('maskPii', () => {
  it('redacts known PII fields by key', () => {
    const input = {
      phone_number: '+628123456789',
      display_name: 'John Doe',
      email: 'john@example.com',
      status: 'open',
    };
    const result = maskPii(input) as Record<string, unknown>;
    expect(result['phone_number']).toBe(MASKED_FIELD);
    expect(result['display_name']).toBe(MASKED_FIELD);
    expect(result['email']).toBe(MASKED_FIELD);
    // Non-PII field preserved
    expect(result['status']).toBe('open');
  });

  it('does not mutate the original object', () => {
    const input = { phone_number: '+628123456789', status: 'open' };
    maskPii(input);
    expect(input.phone_number).toBe('+628123456789');
  });

  it('recurses into nested objects', () => {
    const input = {
      user: {
        phone_number: '+628123456789',
        role: 'admin',
      },
    };
    const result = maskPii(input) as { user: Record<string, unknown> };
    expect(result.user['phone_number']).toBe(MASKED_FIELD);
    expect(result.user['role']).toBe('admin');
  });

  it('recurses into arrays', () => {
    const input = [
      { phone_number: '+628111', status: 'open' },
      { phone_number: '+628222', status: 'closed' },
    ];
    const result = maskPii(input) as Array<Record<string, unknown>>;
    expect(result[0]!['phone_number']).toBe(MASKED_FIELD);
    expect(result[1]!['phone_number']).toBe(MASKED_FIELD);
    expect(result[0]!['status']).toBe('open');
  });

  it('masks PII patterns in non-blocklisted string values', () => {
    const input = { description: 'Contact john@example.com for support' };
    const result = maskPii(input) as Record<string, unknown>;
    expect(result['description'] as string).toContain(MASKED_EMAIL);
    expect(result['description'] as string).not.toContain('john@example.com');
  });

  it('handles null, undefined, and primitive values', () => {
    expect(maskPii(null)).toBeNull();
    expect(maskPii(undefined)).toBeUndefined();
    expect(maskPii(42)).toBe(42);
    expect(maskPii(true)).toBe(true);
  });
});
