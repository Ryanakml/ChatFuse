export class DatabaseUnavailableError extends Error {
  constructor(message: string = 'Database unavailable') {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

const UNAVAILABLE_PATTERNS = [
  'database unavailable',
  'fetch failed',
  'failed to fetch',
  'network',
  'timeout',
  'timed out',
  'connection',
  'econnrefused',
  'enotfound',
  'supabaseurl is required',
  'supabasekey is required',
  'invalid url',
];

const isUnavailableMessage = (message: string) => {
  const normalized = message.toLowerCase();
  return UNAVAILABLE_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const extractMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return String(error);
};

export const isDatabaseUnavailableError = (error: unknown): error is DatabaseUnavailableError =>
  error instanceof DatabaseUnavailableError;

export const toRepositoryError = (error: unknown, operation: string): Error => {
  if (isDatabaseUnavailableError(error)) {
    return error;
  }

  const message = extractMessage(error);

  if (isUnavailableMessage(message)) {
    return new DatabaseUnavailableError();
  }

  return new Error(`${operation} failed: ${message}`);
};
