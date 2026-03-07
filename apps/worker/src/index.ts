import dotenv from 'dotenv';
import { Queue } from 'bullmq';
import {
  DEFAULT_WORKER_PERMANENT_MAX_ATTEMPTS,
  DEFAULT_WORKER_TRANSIENT_MAX_ATTEMPTS,
  resolveWorkerRetryPolicy,
  validateEnv,
} from '@wa-chat/config';
import {
  INGRESS_DLQ_JOB_NAME,
  INGRESS_DLQ_QUEUE_NAME,
  INGRESS_JOB_NAME,
  INGRESS_QUEUE_NAME,
  coerceJsonValue,
  createIngressDlqJobPayload,
  type IngressDlqErrorClass,
  type IngressDlqJobPayload,
  type IngressDlqRetryOptions,
  type IngressJobPayload,
} from '@wa-chat/shared';
import { pathToFileURL } from 'node:url';
import {
  classifyWorkerError,
  createIngressQueueWorker,
  type IngressJobProcessor,
  type WorkerPolicies,
} from './queue/consumer.js';

dotenv.config();

export const workerName = 'wa-chat-worker';
export const DEFAULT_WORKER_CONCURRENCY = 10;
export const DEFAULT_WORKER_JOB_TIMEOUT_MS = 30_000;
export const DEFAULT_WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS = DEFAULT_WORKER_TRANSIENT_MAX_ATTEMPTS;
export const DEFAULT_WORKER_RETRY_PERMANENT_MAX_ATTEMPTS = DEFAULT_WORKER_PERMANENT_MAX_ATTEMPTS;

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
  environmentVariableName: string,
) => {
  if (!value || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${environmentVariableName} must be a positive integer`);
  }

  return parsed;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNullableNonNegativeInteger = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
};

const toNullablePositiveInteger = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
};

const toNullableFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
};

const toNullableJitter = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return null;
  }

  return value;
};

const resolveDlqRetryOptions = (opts: { attempts?: number; backoff?: unknown } | undefined) => {
  const attempts = toNullablePositiveInteger(opts?.attempts);
  const backoff = opts?.backoff;

  if (typeof backoff === 'number' && Number.isFinite(backoff) && backoff >= 0) {
    return {
      attempts,
      backoffType: 'fixed',
      backoffDelayMs: Math.floor(backoff),
      backoffJitter: null,
    } satisfies IngressDlqRetryOptions;
  }

  if (isRecord(backoff)) {
    const backoffType = typeof backoff.type === 'string' ? backoff.type : null;
    const backoffDelayMs = toNullableNonNegativeInteger(backoff.delay);
    const backoffJitter = toNullableJitter(backoff.jitter);

    return {
      attempts,
      backoffType,
      backoffDelayMs,
      backoffJitter,
    } satisfies IngressDlqRetryOptions;
  }

  return {
    attempts,
    backoffType: null,
    backoffDelayMs: null,
    backoffJitter: null,
  } satisfies IngressDlqRetryOptions;
};

const extractEventKey = (jobData: unknown, fallbackJobId: string) => {
  if (isRecord(jobData) && typeof jobData.eventKey === 'string' && jobData.eventKey.trim() !== '') {
    return jobData.eventKey.trim();
  }

  return `dlq-job:${fallbackJobId}`;
};

export type FailedIngressJobLike = {
  id?: string | number | null;
  name?: string;
  queueName?: string;
  data?: unknown;
  attemptsMade?: number;
  opts?: {
    attempts?: number;
    backoff?: unknown;
  };
  timestamp?: number;
  processedOn?: number;
  finishedOn?: number;
};

export type IngressDlqQueue = {
  enqueue: (payload: IngressDlqJobPayload) => Promise<string | null>;
  close: () => Promise<void>;
};

export const createBullMqIngressDlqQueue = (redisUrl: string): IngressDlqQueue => {
  const queue = new Queue(INGRESS_DLQ_QUEUE_NAME, {
    connection: { url: redisUrl },
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    },
  });

  return {
    enqueue: async (payload) => {
      const job = await queue.add(INGRESS_DLQ_JOB_NAME, payload);
      return job.id === undefined ? null : String(job.id);
    },
    close: async () => {
      await queue.close();
    },
  };
};

export const resolveWorkerPolicies = (env: {
  WORKER_CONCURRENCY?: string;
  WORKER_JOB_TIMEOUT_MS?: string;
  WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS?: string;
  WORKER_RETRY_PERMANENT_MAX_ATTEMPTS?: string;
  WORKER_RETRY_BACKOFF_DELAY_MS?: string;
  WORKER_RETRY_BACKOFF_JITTER?: string;
}): WorkerPolicies => {
  const retryPolicy = resolveWorkerRetryPolicy(env);

  return {
    concurrency: parsePositiveInteger(
      env.WORKER_CONCURRENCY,
      DEFAULT_WORKER_CONCURRENCY,
      'WORKER_CONCURRENCY',
    ),
    jobTimeoutMs: parsePositiveInteger(
      env.WORKER_JOB_TIMEOUT_MS,
      DEFAULT_WORKER_JOB_TIMEOUT_MS,
      'WORKER_JOB_TIMEOUT_MS',
    ),
    retry: {
      transientMaxAttempts: retryPolicy.transient.maxAttempts,
      permanentMaxAttempts: retryPolicy.permanent.maxAttempts,
    },
  };
};

export const resolveWillRetry = (input: {
  errorClass: IngressDlqErrorClass;
  attemptsMade: number | null;
  maxAttempts: number | null;
  permanentMaxAttempts: number;
}): boolean | null => {
  if (input.attemptsMade === null || input.maxAttempts === null) {
    return null;
  }

  if (input.errorClass === 'permanent') {
    return input.attemptsMade < input.permanentMaxAttempts;
  }

  return input.attemptsMade < input.maxAttempts;
};

export const buildIngressDlqPayloadFromFailure = (input: {
  job: FailedIngressJobLike;
  errorClass: IngressDlqErrorClass;
  error: Error;
  failedAt?: string;
}): IngressDlqJobPayload => {
  const fallbackJobId =
    input.job.id === undefined || input.job.id === null ? 'unknown' : String(input.job.id);

  return createIngressDlqJobPayload({
    eventKey: extractEventKey(input.job.data, fallbackJobId),
    originalJob: {
      id: fallbackJobId,
      name: input.job.name?.trim() || INGRESS_JOB_NAME,
      queueName: input.job.queueName?.trim() || INGRESS_QUEUE_NAME,
      data: coerceJsonValue(input.job.data),
      attemptsMade: toNullableNonNegativeInteger(input.job.attemptsMade),
      maxAttempts: toNullablePositiveInteger(input.job.opts?.attempts),
      timestamp: toNullableFiniteNumber(input.job.timestamp),
      processedOn: toNullableFiniteNumber(input.job.processedOn),
      finishedOn: toNullableFiniteNumber(input.job.finishedOn),
      retry: resolveDlqRetryOptions(input.job.opts),
    },
    failure: {
      reason:
        input.errorClass === 'permanent'
          ? 'permanent_retries_exhausted'
          : 'transient_retries_exhausted',
      errorClass: input.errorClass,
      errorName: input.error.name || 'Error',
      errorMessage: input.error.message || 'Unknown error',
      errorStack: input.error.stack ?? null,
      failedAt: input.failedAt ?? new Date().toISOString(),
    },
  });
};

export type WorkerFailureDlqRouteResult = {
  errorClass: IngressDlqErrorClass;
  attemptsMade: number | null;
  maxAttempts: number | null;
  willRetry: boolean | null;
  routedToDlq: boolean;
  dlqJobId: string | null;
  dlqRouteError: string | null;
};

export const routeFailedIngressJobToDlq = async (input: {
  job: FailedIngressJobLike | undefined;
  error: Error;
  policies: WorkerPolicies;
  dlqQueue: IngressDlqQueue;
  now?: () => string;
}): Promise<WorkerFailureDlqRouteResult> => {
  const classifiedError = classifyWorkerError(input.error);
  const attemptsMade = toNullableNonNegativeInteger(input.job?.attemptsMade);
  const maxAttempts = toNullablePositiveInteger(input.job?.opts?.attempts);
  const willRetry = resolveWillRetry({
    errorClass: classifiedError.errorClass,
    attemptsMade,
    maxAttempts,
    permanentMaxAttempts: input.policies.retry.permanentMaxAttempts,
  });

  if (!input.job || willRetry !== false) {
    return {
      errorClass: classifiedError.errorClass,
      attemptsMade,
      maxAttempts,
      willRetry,
      routedToDlq: false,
      dlqJobId: null,
      dlqRouteError: null,
    };
  }

  try {
    const dlqPayload = buildIngressDlqPayloadFromFailure({
      job: input.job,
      errorClass: classifiedError.errorClass,
      error: classifiedError.error,
      ...(input.now ? { failedAt: input.now() } : {}),
    });
    const dlqJobId = await input.dlqQueue.enqueue(dlqPayload);

    return {
      errorClass: classifiedError.errorClass,
      attemptsMade,
      maxAttempts,
      willRetry,
      routedToDlq: true,
      dlqJobId,
      dlqRouteError: null,
    };
  } catch (error: unknown) {
    const dlqRouteError = error instanceof Error ? error.message : String(error);
    return {
      errorClass: classifiedError.errorClass,
      attemptsMade,
      maxAttempts,
      willRetry,
      routedToDlq: false,
      dlqJobId: null,
      dlqRouteError,
    };
  }
};

export type WorkerService = {
  policies: WorkerPolicies;
  close: () => Promise<void>;
};

type StartWorkerOptions = {
  processor?: IngressJobProcessor;
  registerSignalHandlers?: boolean;
  dlqQueue?: IngressDlqQueue;
};

const defaultProcessor: IngressJobProcessor = async (job: IngressJobPayload) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      event: 'worker.job.processed',
      eventKey: job.eventKey,
      schemaVersion: job.schemaVersion,
    }),
  );
};

export const startWorker = (
  runtimeEnv: NodeJS.ProcessEnv,
  options: StartWorkerOptions = {},
): WorkerService => {
  const env = validateEnv(runtimeEnv);
  const policies = resolveWorkerPolicies(env);
  const processor = options.processor ?? defaultProcessor;
  const dlqQueue = options.dlqQueue ?? createBullMqIngressDlqQueue(env.REDIS_URL);
  const worker = createIngressQueueWorker({
    redisUrl: env.REDIS_URL,
    policies,
    processor,
  });

  const mainQueue = new Queue(INGRESS_QUEUE_NAME, {
    connection: { url: env.REDIS_URL },
  });

  const queueDepthMetricsInterval = setInterval(() => {
    mainQueue
      .getJobCounts()
      .then((counts) => {
        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'info',
            event: 'worker.queue.depth',
            worker: workerName,
            queueName: INGRESS_QUEUE_NAME,
            counts,
          }),
        );
      })
      .catch((error: unknown) => {
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'error',
            event: 'worker.queue.depth.error',
            worker: workerName,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      });
  }, 60000);

  worker.on('ready', () => {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        event: 'worker.ready',
        worker: workerName,
        queueName: INGRESS_QUEUE_NAME,
        dlqQueueName: INGRESS_DLQ_QUEUE_NAME,
        concurrency: policies.concurrency,
        jobTimeoutMs: policies.jobTimeoutMs,
        transientMaxAttempts: policies.retry.transientMaxAttempts,
        permanentMaxAttempts: policies.retry.permanentMaxAttempts,
      }),
    );
  });

  worker.on('error', (error: Error) => {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'worker.error',
        worker: workerName,
        message: error.message,
      }),
    );
  });

  worker.on('completed', (job) => {
    const processedOn = job.processedOn;
    const finishedOn = job.finishedOn || Date.now();
    const processingLatencyMs = processedOn ? finishedOn - processedOn : null;

    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        event: 'worker.job.completed',
        worker: workerName,
        queueName: INGRESS_QUEUE_NAME,
        jobId: job?.id ?? null,
        jobName: job?.name ?? null,
        attemptsMade: job?.attemptsMade ?? 0,
        processingLatencyMs,
      }),
    );
  });

  worker.on('failed', (job, error: Error) => {
    const processedOn = job?.processedOn;
    const finishedOn = job?.finishedOn || Date.now();
    const processingLatencyMs = processedOn ? finishedOn - processedOn : null;

    void routeFailedIngressJobToDlq({
      job,
      error,
      policies,
      dlqQueue,
    })
      .then((routeResult) => {
        const baseLogData = {
          ts: new Date().toISOString(),
          worker: workerName,
          queueName: INGRESS_QUEUE_NAME,
          dlqQueueName: INGRESS_DLQ_QUEUE_NAME,
          jobId: job?.id ?? null,
          jobName: job?.name ?? null,
          errorClass: routeResult.errorClass,
          attemptsMade: routeResult.attemptsMade,
          maxAttempts: routeResult.maxAttempts,
          willRetry: routeResult.willRetry,
          routedToDlq: routeResult.routedToDlq,
          dlqJobId: routeResult.dlqJobId,
          dlqRouteError: routeResult.dlqRouteError,
          processingLatencyMs,
          message: error.message,
        };

        if (routeResult.willRetry) {
          console.warn(
            JSON.stringify({
              ...baseLogData,
              level: 'warn',
              event: 'worker.job.retried',
            }),
          );
        } else {
          console.error(
            JSON.stringify({
              ...baseLogData,
              level: 'error',
              event: 'worker.job.failed',
            }),
          );
        }

        if (routeResult.routedToDlq) {
          console.error(
            JSON.stringify({
              ts: baseLogData.ts,
              level: 'error',
              event: 'worker.dlq.inflow.alert',
              worker: workerName,
              jobId: baseLogData.jobId,
              dlqJobId: baseLogData.dlqJobId,
              reason: 'retries_exhausted',
              message: 'Job exhausted all retries and was routed to DLQ',
            }),
          );
        }
      })
      .catch((routeError: unknown) => {
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'error',
            event: 'worker.job.failed.logging_error',
            worker: workerName,
            message: routeError instanceof Error ? routeError.message : String(routeError),
          }),
        );
      });
  });

  const close = async () => {
    clearInterval(queueDepthMetricsInterval);
    await worker.close();
    await mainQueue.close();
    await dlqQueue.close();
  };

  if (options.registerSignalHandlers !== false) {
    const registerSignalHandler = (signal: NodeJS.Signals) => {
      process.once(signal, () => {
        void close()
          .then(() => {
            process.exit(0);
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            console.error(
              JSON.stringify({
                ts: new Date().toISOString(),
                level: 'error',
                event: 'worker.shutdown.failed',
                worker: workerName,
                signal,
                message,
              }),
            );
            process.exit(1);
          });
      });
    };

    registerSignalHandler('SIGINT');
    registerSignalHandler('SIGTERM');
  }

  return {
    policies,
    close,
  };
};

const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entrypointUrl === import.meta.url) {
  startWorker(process.env);
}
