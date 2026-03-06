type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
export type IngressJobPayload = {
    eventKey: string;
    payload: JsonValue;
    receivedAt: string;
};
export type IngressTraceContext = {
    traceId: string;
    correlationId: string;
    method: string;
    path: string;
    sourceIp: string;
    receivedAt: string;
};
type VerificationFailureReason = 'missing_signature' | 'invalid_signature';
type MalformedPayloadReason = 'invalid_structure' | 'invalid_json' | 'payload_too_large';
export interface IngressObservability {
    onIngressStart: (context: IngressTraceContext) => void;
    onVerificationFailure: (context: IngressTraceContext, details: {
        reason: VerificationFailureReason;
    }) => void;
    onMalformedPayload: (context: IngressTraceContext, details: {
        reason: MalformedPayloadReason;
    }) => void;
    onDuplicateHit: (context: IngressTraceContext, details: {
        eventKey: string;
    }) => void;
    onEnqueueSuccess: (context: IngressTraceContext, details: {
        eventKey: string;
    }) => void;
    onEnqueueFailure: (context: IngressTraceContext, details: {
        eventKey: string;
        errorCode: string;
    }) => void;
}
export interface IdempotencyStore {
    setIfNotExists: (key: string, ttlSeconds: number) => Promise<boolean>;
    delete: (key: string) => Promise<void>;
}
export interface IngressQueue {
    enqueue: (job: IngressJobPayload) => Promise<void>;
}
type AppDependencies = {
    idempotencyStore: IdempotencyStore;
    ingressQueue: IngressQueue;
    idempotencyTtlSeconds: number;
    observability: IngressObservability;
};
type AppOptions = Partial<AppDependencies>;
export declare const createRedisIdempotencyStore: (redisUrl: string) => IdempotencyStore;
export declare const createBullMqIngressQueue: (redisUrl: string) => IngressQueue;
export declare const createApp: (runtimeEnv: NodeJS.ProcessEnv, options?: AppOptions) => import("express-serve-static-core").Express;
export declare const startServer: (runtimeEnv: NodeJS.ProcessEnv) => import("node:http").Server<typeof import("node:http").IncomingMessage, typeof import("node:http").ServerResponse>;
export {};
//# sourceMappingURL=index.d.ts.map