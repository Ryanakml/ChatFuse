import { UnrecoverableError, Worker, type Job } from 'bullmq';
import {
  INGRESS_JOB_NAME,
  INGRESS_QUEUE_NAME,
  assertIngressJobPayload,
  type IngressJobPayload,
} from '@wa-chat/shared';

export class WorkerJobTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Worker job exceeded timeout of ${timeoutMs}ms`);
    this.name = 'WorkerJobTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class WorkerPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerPermanentError';
  }
}

export class UnexpectedIngressJobNameError extends Error {
  readonly jobName: string;

  constructor(jobName: string) {
    super(`Unexpected ingress job name "${jobName}"`);
    this.name = 'UnexpectedIngressJobNameError';
    this.jobName = jobName;
  }
}

export class InvalidIngressJobPayloadError extends Error {
  constructor(cause: Error) {
    super(cause.message);
    this.name = 'InvalidIngressJobPayloadError';
  }
}

export type WorkerErrorClass = 'transient' | 'permanent';

export type WorkerPolicies = {
  concurrency: number;
  jobTimeoutMs: number;
  retry: {
    transientMaxAttempts: number;
    permanentMaxAttempts: number;
  };
};

export type IngressJobProcessor = (payload: IngressJobPayload) => Promise<void>;

const normalizeUnknownError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(`Unknown worker error: ${String(error)}`);

export const classifyWorkerError = (
  error: unknown,
): {
  errorClass: WorkerErrorClass;
  error: Error;
} => {
  const normalized = normalizeUnknownError(error);

  if (
    normalized instanceof UnrecoverableError ||
    normalized instanceof WorkerPermanentError ||
    normalized instanceof UnexpectedIngressJobNameError ||
    normalized instanceof InvalidIngressJobPayloadError
  ) {
    return {
      errorClass: 'permanent',
      error: normalized,
    };
  }

  return {
    errorClass: 'transient',
    error: normalized,
  };
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new WorkerJobTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

export const runIngressJob = async (input: {
  jobName: string;
  jobData: unknown;
  attemptsMade?: number;
  policies: WorkerPolicies;
  processor: IngressJobProcessor;
}) => {
  const { jobName, jobData, policies, processor } = input;
  const attemptsMade = input.attemptsMade ?? 0;
  const currentAttempt = attemptsMade + 1;

  try {
    if (jobName !== INGRESS_JOB_NAME) {
      throw new UnexpectedIngressJobNameError(jobName);
    }

    let payload: IngressJobPayload;
    try {
      payload = assertIngressJobPayload(jobData);
    } catch (error: unknown) {
      throw new InvalidIngressJobPayloadError(normalizeUnknownError(error));
    }

    await withTimeout(processor(payload), policies.jobTimeoutMs);
  } catch (error: unknown) {
    const classifiedError = classifyWorkerError(error);
    const permanentAttempts = policies.retry.permanentMaxAttempts;

    if (classifiedError.errorClass === 'permanent' && currentAttempt >= permanentAttempts) {
      if (classifiedError.error instanceof UnrecoverableError) {
        throw classifiedError.error;
      }

      throw new UnrecoverableError(classifiedError.error.message);
    }

    throw classifiedError.error;
  }
};

export const createIngressQueueWorker = (input: {
  redisUrl: string;
  policies: WorkerPolicies;
  processor: IngressJobProcessor;
}) =>
  new Worker(
    INGRESS_QUEUE_NAME,
    async (job: Job<unknown>) => {
      await runIngressJob({
        jobName: job.name,
        jobData: job.data,
        attemptsMade: job.attemptsMade,
        policies: input.policies,
        processor: input.processor,
      });
    },
    {
      connection: {
        url: input.redisUrl,
      },
      concurrency: input.policies.concurrency,
    },
  );
