import { describe, expect, it } from 'vitest';
import {
  buildIndonesianPhoneLookupCandidates,
  normalizeIndonesianPhoneNumber,
} from './phone.js';

describe('phone helpers', () => {
  it('normalizes Indonesian mobile numbers to E.164 format', () => {
    expect(normalizeIndonesianPhoneNumber('0812999000')).toBe('+62812999000');
    expect(normalizeIndonesianPhoneNumber('62812999000')).toBe('+62812999000');
    expect(normalizeIndonesianPhoneNumber('+62 812-999-000')).toBe('+62812999000');
    expect(normalizeIndonesianPhoneNumber('812999000')).toBe('+62812999000');
  });

  it('returns null for invalid inputs', () => {
    expect(normalizeIndonesianPhoneNumber('')).toBeNull();
    expect(normalizeIndonesianPhoneNumber('abc')).toBeNull();
    expect(normalizeIndonesianPhoneNumber('123')).toBeNull();
  });

  it('builds lookup candidates for equivalent formats', () => {
    expect(buildIndonesianPhoneLookupCandidates('0812999000')).toEqual([
      '+62812999000',
      '62812999000',
      '0812999000',
    ]);
  });
});
