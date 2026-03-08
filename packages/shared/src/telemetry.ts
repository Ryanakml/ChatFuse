import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
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
        url: otlpEndpoint,
      })
    : new OTLPTraceExporter(); // Falls back to default 'http://localhost:4318/v1/traces'

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy fs / console instrumentations if needed, but keeping defaults is good for observability
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

  // Gracefully shut down the SDK on process exit when running in Node.js.
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
