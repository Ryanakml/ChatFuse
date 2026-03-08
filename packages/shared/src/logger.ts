import pino from 'pino';
import { maskPii } from './pii.js';

type ProcessEnvLike = {
  env?: Record<string, string | undefined>;
};

const processEnv = (globalThis as typeof globalThis & { process?: ProcessEnvLike }).process?.env;
const isDev = processEnv?.NODE_ENV !== 'production';

export const logger = pino({
  level: processEnv?.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
    // In production: mask PII from every log record before it leaves the process.
    // In development: full fidelity for debugging.
    log: (object) => {
      if (isDev) {
        return object;
      }
      return maskPii(object) as Record<string, unknown>;
    },
  },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  }),
});
