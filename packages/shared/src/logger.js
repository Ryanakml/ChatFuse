import pino from 'pino';
const processEnv = globalThis?.process?.env;
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
//# sourceMappingURL=logger.js.map
