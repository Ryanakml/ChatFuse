import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { metrics } from '@opentelemetry/api';
import { logger } from './logger.js';

type ProcessLike = {
  env?: Record<string, string | undefined>;
  on?: (event: string, listener: () => void) => void;
  exit?: (code?: number) => never;
};

export function setupTelemetry(serviceName: string) {
  const processRef = (globalThis as typeof globalThis & { process?: ProcessLike }).process;
  const otlpEndpoint = processRef?.env?.OTEL_EXPORTER_OTLP_ENDPOINT;

  const traceExporter = otlpEndpoint
    ? new OTLPTraceExporter({
        url: otlpEndpoint.endsWith('/v1/traces') ? otlpEndpoint : `${otlpEndpoint}/v1/traces`,
      })
    : new OTLPTraceExporter();

  const metricExporter = otlpEndpoint
    ? new OTLPMetricExporter({
        url: otlpEndpoint.endsWith('/v1/traces')
          ? otlpEndpoint.replace('/v1/traces', '/v1/metrics')
          : `${otlpEndpoint}/v1/metrics`,
      })
    : new OTLPMetricExporter();

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10000,
  });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    traceExporter,
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
    logger.info(`Telemetry initialized for service: ${serviceName}`);
  } catch (error) {
    logger.error({ error }, 'Error initializing telemetry');
  }

  processRef?.on?.('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => logger.info('Telemetry shut down successfully'))
      .catch((error) => logger.error({ error }, 'Error shutting down telemetry'))
      .finally(() => {
        processRef?.exit?.(0);
      });
  });

  return sdk;
}

// ---------------------------------------------------------
// Metric Instruments (K2 - Observability)
// ---------------------------------------------------------

export const meter = metrics.getMeter('wa-chat-meter');

export const appMetrics = {
  // API Metrics
  apiRequestCount: meter.createCounter('api_request_count', {
    description: 'Total number of API requests',
  }),
  apiLatency: meter.createHistogram('api_latency_ms', {
    description: 'API request latency in milliseconds',
    unit: 'ms',
  }),
  apiErrorCount: meter.createCounter('api_error_count', {
    description: 'Total number of API errors',
  }),

  // Queue Metrics
  queueDepth: meter.createUpDownCounter('queue_depth', {
    description: 'Current number of jobs in the queue',
  }),
  queueProcessingLatency: meter.createHistogram('queue_processing_latency_ms', {
    description: 'Latency of processing a single queue job',
    unit: 'ms',
  }),
  queueRetryCount: meter.createCounter('queue_retry_count', {
    description: 'Total number of retried queue jobs',
  }),
  queueDlqCount: meter.createCounter('queue_dlq_count', {
    description: 'Total number of jobs sent to DLQ',
  }),

  // Agent Metrics
  agentPathCount: meter.createCounter('agent_path_count', {
    description: 'Agent path execution count (by path type)',
  }),
  agentProviderFallbackCount: meter.createCounter('agent_provider_fallback_count', {
    description: 'Total number of provider fallbacks triggered',
  }),
  agentParseFailureCount: meter.createCounter('agent_parse_failure_count', {
    description: 'Total number of parse failures from LLM outputs',
  }),

  // Tool Metrics
  toolExecutionCount: meter.createCounter('tool_execution_count', {
    description: 'Tool execution outcomes (success/error/timeout)',
  }),
};
