const DIGIT_ONLY_PATTERN = /\D+/g;
const MIN_PHONE_DIGITS = 9;
const MAX_PHONE_DIGITS = 16;

const sanitizePhoneInput = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return '';
  }

  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(DIGIT_ONLY_PATTERN, '')}`;
  }

  return trimmed.replace(DIGIT_ONLY_PATTERN, '');
};

const isValidLength = (digits: string): boolean =>
  digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS;

/**
 * Normalizes Indonesian mobile numbers to E.164 (`+62...`) when possible.
 * Returns null when input cannot be interpreted as a plausible phone number.
 */
export const normalizeIndonesianPhoneNumber = (input: string): string | null => {
  const sanitized = sanitizePhoneInput(input);
  if (sanitized === '') {
    return null;
  }

  if (sanitized.startsWith('+')) {
    const digits = sanitized.slice(1);
    if (!isValidLength(digits)) {
      return null;
    }
    return `+${digits}`;
  }

  if (sanitized.startsWith('62')) {
    return isValidLength(sanitized) ? `+${sanitized}` : null;
  }

  if (sanitized.startsWith('0')) {
    const withCountryCode = `62${sanitized.slice(1)}`;
    return isValidLength(withCountryCode) ? `+${withCountryCode}` : null;
  }

  if (sanitized.startsWith('8')) {
    const withCountryCode = `62${sanitized}`;
    return isValidLength(withCountryCode) ? `+${withCountryCode}` : null;
  }

  return null;
};

/**
 * Returns equivalent lookup candidates for Indonesian numbers:
 * +62..., 62..., and local 0...
 */
export const buildIndonesianPhoneLookupCandidates = (input: string): string[] => {
  const normalized = normalizeIndonesianPhoneNumber(input);
  if (!normalized) {
    return [];
  }

  const noPlus = normalized.slice(1);
  const local = noPlus.startsWith('62') ? `0${noPlus.slice(2)}` : null;

  const candidates = new Set<string>([normalized, noPlus]);
  if (local && isValidLength(local.replace(DIGIT_ONLY_PATTERN, ''))) {
    candidates.add(local);
  }

  return [...candidates];
};
