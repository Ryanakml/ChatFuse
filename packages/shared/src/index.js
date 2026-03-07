export const INGRESS_QUEUE_NAME = 'wa-webhook-ingress';
export const INGRESS_JOB_NAME = 'ingress-webhook-event';
export const INGRESS_JOB_SCHEMA_VERSION = 1;
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
export const isJsonValue = (value) => {
    if (value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean') {
        return true;
    }
    if (Array.isArray(value)) {
        return value.every((entry) => isJsonValue(entry));
    }
    if (!isRecord(value)) {
        return false;
    }
    return Object.values(value).every((entry) => isJsonValue(entry));
};
export const isIngressJobPayload = (value) => {
    if (!isRecord(value)) {
        return false;
    }
    if (value.schemaVersion !== INGRESS_JOB_SCHEMA_VERSION) {
        return false;
    }
    if (typeof value.eventKey !== 'string' || value.eventKey.trim() === '') {
        return false;
    }
    if (typeof value.receivedAt !== 'string' || Number.isNaN(Date.parse(value.receivedAt))) {
        return false;
    }
    return isJsonValue(value.payload);
};
export const assertIngressJobPayload = (value) => {
    if (!isIngressJobPayload(value)) {
        throw new Error('Invalid ingress job payload');
    }
    return value;
};
export const createIngressJobPayload = (input) => {
    const eventKey = input.eventKey.trim();
    if (!eventKey) {
        throw new Error('Ingress job eventKey must be a non-empty string');
    }
    const receivedAt = input.receivedAt ?? new Date().toISOString();
    if (Number.isNaN(Date.parse(receivedAt))) {
        throw new Error('Ingress job receivedAt must be a valid ISO timestamp');
    }
    return {
        schemaVersion: INGRESS_JOB_SCHEMA_VERSION,
        eventKey,
        payload: input.payload,
        receivedAt,
    };
};
//# sourceMappingURL=index.js.map