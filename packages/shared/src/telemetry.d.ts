import { NodeSDK } from '@opentelemetry/sdk-node';
export declare function setupTelemetry(serviceName: string): NodeSDK;
export declare const meter: import("@opentelemetry/api").Meter;
export declare const appMetrics: {
    apiRequestCount: import("@opentelemetry/api").Counter<import("@opentelemetry/api").Attributes>;
    apiLatency: import("@opentelemetry/api").Histogram<import("@opentelemetry/api").Attributes>;
    apiErrorCount: import("@opentelemetry/api").Counter<import("@opentelemetry/api").Attributes>;
    queueDepth: import("@opentelemetry/api").UpDownCounter<import("@opentelemetry/api").Attributes>;
    queueProcessingLatency: import("@opentelemetry/api").Histogram<import("@opentelemetry/api").Attributes>;
    queueRetryCount: import("@opentelemetry/api").Counter<import("@opentelemetry/api").Attributes>;
    queueDlqCount: import("@opentelemetry/api").Counter<import("@opentelemetry/api").Attributes>;
    agentPathCount: import("@opentelemetry/api").Counter<import("@opentelemetry/api").Attributes>;
    agentProviderFallbackCount: import("@opentelemetry/api").Counter<import("@opentelemetry/api").Attributes>;
    agentParseFailureCount: import("@opentelemetry/api").Counter<import("@opentelemetry/api").Attributes>;
    toolExecutionCount: import("@opentelemetry/api").Counter<import("@opentelemetry/api").Attributes>;
};
//# sourceMappingURL=telemetry.d.ts.map