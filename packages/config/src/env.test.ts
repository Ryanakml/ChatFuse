import assert from 'node:assert/strict';
import {
  DEFAULT_WORKER_PERMANENT_MAX_ATTEMPTS,
  DEFAULT_WORKER_RETRY_BACKOFF_DELAY_MS,
  DEFAULT_WORKER_RETRY_BACKOFF_JITTER,
  DEFAULT_WORKER_TRANSIENT_MAX_ATTEMPTS,
  OPTIONAL_ENV_VARS,
  REQUIRED_ENV_VARS,
  resolveWorkerRetryPolicy,
  validateEnv,
} from './index.js';

const buildRequiredEnv = () => {
  return Object.fromEntries(REQUIRED_ENV_VARS.map((key) => [key, 'test-value'])) as Record<
    string,
    string
  >;
};

const baseEnv = buildRequiredEnv();
const result = validateEnv(baseEnv);

assert.equal(result.NODE_ENV, 'test-value');
assert.equal(result.PORT, 'test-value');

const optionalEnv = {
  ...baseEnv,
  [OPTIONAL_ENV_VARS[0]]: '1',
};

const optionalResult = validateEnv(optionalEnv);
assert.equal(optionalResult.LANGCHAIN_TRACING_V2, '1');

const defaultRetryPolicy = resolveWorkerRetryPolicy({});
assert.equal(defaultRetryPolicy.transient.maxAttempts, DEFAULT_WORKER_TRANSIENT_MAX_ATTEMPTS);
assert.equal(defaultRetryPolicy.permanent.maxAttempts, DEFAULT_WORKER_PERMANENT_MAX_ATTEMPTS);
assert.equal(defaultRetryPolicy.transient.backoffDelayMs, DEFAULT_WORKER_RETRY_BACKOFF_DELAY_MS);
assert.equal(defaultRetryPolicy.transient.backoffJitter, DEFAULT_WORKER_RETRY_BACKOFF_JITTER);

const explicitRetryPolicy = resolveWorkerRetryPolicy({
  WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS: '7',
  WORKER_RETRY_PERMANENT_MAX_ATTEMPTS: '2',
  WORKER_RETRY_BACKOFF_DELAY_MS: '2500',
  WORKER_RETRY_BACKOFF_JITTER: '0.45',
});
assert.equal(explicitRetryPolicy.transient.maxAttempts, 7);
assert.equal(explicitRetryPolicy.permanent.maxAttempts, 2);
assert.equal(explicitRetryPolicy.transient.backoffDelayMs, 2500);
assert.equal(explicitRetryPolicy.transient.backoffJitter, 0.45);

assert.throws(
  () =>
    resolveWorkerRetryPolicy({
      WORKER_RETRY_BACKOFF_JITTER: '1.2',
    }),
  /WORKER_RETRY_BACKOFF_JITTER must be a number between 0 and 1/,
);

assert.throws(
  () =>
    resolveWorkerRetryPolicy({
      WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS: '2',
      WORKER_RETRY_PERMANENT_MAX_ATTEMPTS: '3',
    }),
  /WORKER_RETRY_PERMANENT_MAX_ATTEMPTS cannot be greater than WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS/,
);

assert.throws(
  () => validateEnv({}),
  (error: unknown) =>
    error instanceof Error &&
    error.message.includes('Missing required env vars') &&
    error.message.includes('NODE_ENV'),
);

const green = '\x1b[32m';
const cyan = '\x1b[36m';
const reset = '\x1b[0m';

console.log(`\n${cyan}ENV VALIDATION TEST${reset}`);
console.log(`${green}✓ Required env validation passed${reset}`);
console.log(`${green}✓ Optional env validation passed${reset}`);
console.log(`${green}✓ Missing env detection passed${reset}`);
console.log(`${cyan}All env tests passed ✔${reset}\n`);
