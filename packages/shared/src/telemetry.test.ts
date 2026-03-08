import { describe, it, expect } from 'vitest';
import { appMetrics, setupTelemetry } from './telemetry.js';

describe('Shared Telemetry', () => {
  it('should export all K2 metric instruments', () => {
    // API
    expect(appMetrics.apiRequestCount).toBeDefined();
    expect(appMetrics.apiLatency).toBeDefined();
    expect(appMetrics.apiErrorCount).toBeDefined();

    // Queue
    expect(appMetrics.queueDepth).toBeDefined();
    expect(appMetrics.queueProcessingLatency).toBeDefined();
    expect(appMetrics.queueRetryCount).toBeDefined();
    expect(appMetrics.queueDlqCount).toBeDefined();

    // Agent
    expect(appMetrics.agentPathCount).toBeDefined();
    expect(appMetrics.agentProviderFallbackCount).toBeDefined();
    expect(appMetrics.agentParseFailureCount).toBeDefined();

    // Tools
    expect(appMetrics.toolExecutionCount).toBeDefined();
  });

  it('should initialize OpenTelemetry SDK gracefully', () => {
    const sdk = setupTelemetry('test-service');
    expect(sdk).toBeDefined();

    // Attempt shutdown to avoid leaking in tests
    return sdk.shutdown().catch(() => {});
  }, 15_000);
});
