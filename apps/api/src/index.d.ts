type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
export type IngressJobPayload = {
    eventKey: string;
    payload: JsonValue;
    receivedAt: string;
};
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
};
type AppOptions = Partial<AppDependencies>;
export declare const createRedisIdempotencyStore: (redisUrl: string) => IdempotencyStore;
export declare const createBullMqIngressQueue: (redisUrl: string) => IngressQueue;
export declare const createApp: (runtimeEnv: NodeJS.ProcessEnv, options?: AppOptions) => import("express-serve-static-core").Express;
export declare const startServer: (runtimeEnv: NodeJS.ProcessEnv) => import("node:http").Server<typeof import("node:http").IncomingMessage, typeof import("node:http").ServerResponse>;
export {};
//# sourceMappingURL=index.d.ts.map