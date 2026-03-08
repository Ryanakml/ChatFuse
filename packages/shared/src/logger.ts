import pino from 'pino';

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
