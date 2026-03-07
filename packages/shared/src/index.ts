export type Message = {
  id: string;
  from: string;
  body: string;
};

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const INGRESS_QUEUE_NAME = 'wa-webhook-ingress';
export const INGRESS_JOB_NAME = 'ingress-webhook-event';
export const INGRESS_JOB_SCHEMA_VERSION = 1 as const;

export type IngressJobPayloadV1 = {
  schemaVersion: typeof INGRESS_JOB_SCHEMA_VERSION;
  eventKey: string;
  payload: JsonValue;
  receivedAt: string;
};

export type IngressJobPayload = IngressJobPayloadV1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
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

export const isIngressJobPayload = (value: unknown): value is IngressJobPayload => {
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

export const assertIngressJobPayload = (value: unknown): IngressJobPayload => {
  if (!isIngressJobPayload(value)) {
    throw new Error('Invalid ingress job payload');
  }

  return value;
};

export const createIngressJobPayload = (input: {
  eventKey: string;
  payload: JsonValue;
  receivedAt?: string;
}): IngressJobPayload => {
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
