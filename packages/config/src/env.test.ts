import assert from 'node:assert/strict';
import { OPTIONAL_ENV_VARS, REQUIRED_ENV_VARS, validateEnv } from './index.js';

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
