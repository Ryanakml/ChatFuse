import dotenv from 'dotenv';
import {
  DEFAULT_WORKER_PERMANENT_MAX_ATTEMPTS,
  DEFAULT_WORKER_TRANSIENT_MAX_ATTEMPTS,
  resolveWorkerRetryPolicy,
  validateEnv,
} from '@wa-chat/config';
import { INGRESS_QUEUE_NAME, type IngressJobPayload } from '@wa-chat/shared';
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

export const resolveWorkerPolicies = (
  env: {
    WORKER_CONCURRENCY?: string;
    WORKER_JOB_TIMEOUT_MS?: string;
    WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS?: string;
    WORKER_RETRY_PERMANENT_MAX_ATTEMPTS?: string;
    WORKER_RETRY_BACKOFF_DELAY_MS?: string;
    WORKER_RETRY_BACKOFF_JITTER?: string;
  },
): WorkerPolicies => {
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

export type WorkerService = {
  policies: WorkerPolicies;
  close: () => Promise<void>;
};

type StartWorkerOptions = {
  processor?: IngressJobProcessor;
  registerSignalHandlers?: boolean;
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
  const worker = createIngressQueueWorker({
    redisUrl: env.REDIS_URL,
    policies,
    processor,
  });

  worker.on('ready', () => {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        event: 'worker.ready',
        worker: workerName,
        queueName: INGRESS_QUEUE_NAME,
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

  worker.on('failed', (job, error: Error) => {
    const classifiedError = classifyWorkerError(error);
    const attemptsMade = typeof job?.attemptsMade === 'number' ? job.attemptsMade : null;
    const maxAttempts = typeof job?.opts.attempts === 'number' ? job.opts.attempts : null;
    const willRetry =
      attemptsMade !== null && maxAttempts !== null
        ? classifiedError.errorClass === 'permanent'
          ? attemptsMade < policies.retry.permanentMaxAttempts
          : attemptsMade < maxAttempts
        : null;

    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'worker.job.failed',
        worker: workerName,
        queueName: INGRESS_QUEUE_NAME,
        jobId: job?.id ?? null,
        jobName: job?.name ?? null,
        errorClass: classifiedError.errorClass,
        attemptsMade,
        maxAttempts,
        willRetry,
        message: error.message,
      }),
    );
  });

  const close = async () => {
    await worker.close();
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
