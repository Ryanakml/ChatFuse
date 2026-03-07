import { Worker, type Job } from 'bullmq';
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

export type WorkerPolicies = {
  concurrency: number;
  jobTimeoutMs: number;
};

export type IngressJobProcessor = (payload: IngressJobPayload) => Promise<void>;

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
  policies: WorkerPolicies;
  processor: IngressJobProcessor;
}) => {
  const { jobName, jobData, policies, processor } = input;

  if (jobName !== INGRESS_JOB_NAME) {
    throw new Error(`Unexpected ingress job name "${jobName}"`);
  }

  const payload = assertIngressJobPayload(jobData);
  await withTimeout(processor(payload), policies.jobTimeoutMs);
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
