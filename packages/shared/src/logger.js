import pino from 'pino';
import { maskPii } from './pii.js';
const processEnv = globalThis.process?.env;
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
            return maskPii(object);
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
//# sourceMappingURL=logger.js.map