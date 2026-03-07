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
export const INGRESS_DLQ_QUEUE_NAME = 'wa-webhook-ingress-dlq';
export const INGRESS_DLQ_JOB_NAME = 'ingress-webhook-event-dlq';
export const INGRESS_DLQ_JOB_SCHEMA_VERSION = 1 as const;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const isNullableInteger = (
  value: unknown,
  options: {
    minimum: number;
  },
): value is number | null =>
  value === null || (typeof value === 'number' && Number.isInteger(value) && value >= options.minimum);

const isNullableFiniteNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value));

const isNullableJitter = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);

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

export const coerceJsonValue = (value: unknown): JsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => coerceJsonValue(entry));
  }

  if (!isRecord(value)) {
    return null;
  }

  const jsonObject: { [key: string]: JsonValue } = {};
  for (const [key, entry] of Object.entries(value)) {
    jsonObject[key] = coerceJsonValue(entry);
  }

  return jsonObject;
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

export const isIngressDlqJobPayload = (value: unknown): value is IngressDlqJobPayload => {
  if (!isRecord(value)) {
    return false;
  }

  if (value.schemaVersion !== INGRESS_DLQ_JOB_SCHEMA_VERSION) {
    return false;
  }

  if (!isNonEmptyString(value.eventKey)) {
    return false;
  }

  const originalJob = isRecord(value.originalJob) ? value.originalJob : null;
  if (!originalJob) {
    return false;
  }

  if (
    !isNonEmptyString(originalJob.id) ||
    !isNonEmptyString(originalJob.name) ||
    !isNonEmptyString(originalJob.queueName)
  ) {
    return false;
  }

  if (!isJsonValue(originalJob.data)) {
    return false;
  }

  if (!isNullableInteger(originalJob.attemptsMade, { minimum: 0 })) {
    return false;
  }

  if (!isNullableInteger(originalJob.maxAttempts, { minimum: 1 })) {
    return false;
  }

  if (!isNullableFiniteNumber(originalJob.timestamp)) {
    return false;
  }

  if (!isNullableFiniteNumber(originalJob.processedOn)) {
    return false;
  }

  if (!isNullableFiniteNumber(originalJob.finishedOn)) {
    return false;
  }

  const retry = isRecord(originalJob.retry) ? originalJob.retry : null;
  if (!retry) {
    return false;
  }

  if (!isNullableInteger(retry.attempts, { minimum: 1 })) {
    return false;
  }

  if (!(retry.backoffType === null || typeof retry.backoffType === 'string')) {
    return false;
  }

  if (!isNullableInteger(retry.backoffDelayMs, { minimum: 0 })) {
    return false;
  }

  if (!isNullableJitter(retry.backoffJitter)) {
    return false;
  }

  const failure = isRecord(value.failure) ? value.failure : null;
  if (!failure) {
    return false;
  }

  if (
    failure.reason !== 'transient_retries_exhausted' &&
    failure.reason !== 'permanent_retries_exhausted'
  ) {
    return false;
  }

  if (failure.errorClass !== 'transient' && failure.errorClass !== 'permanent') {
    return false;
  }

  if (!isNonEmptyString(failure.errorName) || !isNonEmptyString(failure.errorMessage)) {
    return false;
  }

  if (!(failure.errorStack === null || typeof failure.errorStack === 'string')) {
    return false;
  }

  if (!isNonEmptyString(failure.failedAt) || Number.isNaN(Date.parse(failure.failedAt))) {
    return false;
  }

  return true;
};

export const assertIngressDlqJobPayload = (value: unknown): IngressDlqJobPayload => {
  if (!isIngressDlqJobPayload(value)) {
    throw new Error('Invalid ingress DLQ job payload');
  }

  return value;
};

export const createIngressDlqJobPayload = (
  input: Omit<IngressDlqJobPayload, 'schemaVersion'>,
): IngressDlqJobPayload => {
  const payload: IngressDlqJobPayload = {
    schemaVersion: INGRESS_DLQ_JOB_SCHEMA_VERSION,
    eventKey: input.eventKey.trim(),
    originalJob: input.originalJob,
    failure: input.failure,
  };

  return assertIngressDlqJobPayload(payload);
};
