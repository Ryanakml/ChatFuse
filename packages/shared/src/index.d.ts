export type Message = {
    id: string;
    from: string;
    body: string;
};
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
export declare const INGRESS_QUEUE_NAME = "wa-webhook-ingress";
export declare const INGRESS_JOB_NAME = "ingress-webhook-event";
export declare const INGRESS_JOB_SCHEMA_VERSION: 1;
export declare const INGRESS_DLQ_QUEUE_NAME = "wa-webhook-ingress-dlq";
export declare const INGRESS_DLQ_JOB_NAME = "ingress-webhook-event-dlq";
export declare const INGRESS_DLQ_JOB_SCHEMA_VERSION: 1;
export type IngressJobPayloadV1 = {
    schemaVersion: typeof INGRESS_JOB_SCHEMA_VERSION;
    eventKey: string;
    payload: JsonValue;
    receivedAt: string;
};
export type IngressJobPayload = IngressJobPayloadV1;
export type IngressDlqFailureReason = 'transient_retries_exhausted' | 'permanent_retries_exhausted';
export type IngressDlqErrorClass = 'transient' | 'permanent';
export type IngressDlqRetryOptions = {
    attempts: number | null;
    backoffType: string | null;
    backoffDelayMs: number | null;
    backoffJitter: number | null;
};
export type IngressDlqOriginalJobContext = {
    id: string;
    name: string;
    queueName: string;
    data: JsonValue;
    attemptsMade: number | null;
    maxAttempts: number | null;
    timestamp: number | null;
    processedOn: number | null;
    finishedOn: number | null;
    retry: IngressDlqRetryOptions;
};
export type IngressDlqFailureContext = {
    reason: IngressDlqFailureReason;
    errorClass: IngressDlqErrorClass;
    errorName: string;
    errorMessage: string;
    errorStack: string | null;
    failedAt: string;
};
export type IngressDlqJobPayloadV1 = {
    schemaVersion: typeof INGRESS_DLQ_JOB_SCHEMA_VERSION;
    eventKey: string;
    originalJob: IngressDlqOriginalJobContext;
    failure: IngressDlqFailureContext;
};
export type IngressDlqJobPayload = IngressDlqJobPayloadV1;
export declare const isJsonValue: (value: unknown) => value is JsonValue;
export declare const coerceJsonValue: (value: unknown) => JsonValue;
export declare const isIngressJobPayload: (value: unknown) => value is IngressJobPayload;
export declare const assertIngressJobPayload: (value: unknown) => IngressJobPayload;
export declare const createIngressJobPayload: (input: {
    eventKey: string;
    payload: JsonValue;
    receivedAt?: string;
}) => IngressJobPayload;
export declare const isIngressDlqJobPayload: (value: unknown) => value is IngressDlqJobPayload;
export declare const assertIngressDlqJobPayload: (value: unknown) => IngressDlqJobPayload;
export declare const createIngressDlqJobPayload: (input: Omit<IngressDlqJobPayload, "schemaVersion">) => IngressDlqJobPayload;
export * from './rag.js';
//# sourceMappingURL=index.d.ts.map