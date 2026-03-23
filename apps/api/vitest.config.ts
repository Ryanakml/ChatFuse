import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      reportsDirectory: './coverage'
    },
    reporters: ['default', ['junit', { outputFile: './test-results/results.xml' }]]
  }
});
