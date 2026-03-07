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
export type IngressJobPayloadV1 = {
    schemaVersion: typeof INGRESS_JOB_SCHEMA_VERSION;
    eventKey: string;
    payload: JsonValue;
    receivedAt: string;
};
export type IngressJobPayload = IngressJobPayloadV1;
export declare const isJsonValue: (value: unknown) => value is JsonValue;
export declare const isIngressJobPayload: (value: unknown) => value is IngressJobPayload;
export declare const assertIngressJobPayload: (value: unknown) => IngressJobPayload;
export declare const createIngressJobPayload: (input: {
    eventKey: string;
    payload: JsonValue;
    receivedAt?: string;
}) => IngressJobPayload;
//# sourceMappingURL=index.d.ts.map