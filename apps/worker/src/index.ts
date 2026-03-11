import { setupTelemetry, logger } from '@wa-chat/shared';
setupTelemetry('wa-chat-worker');

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
  appMetrics,
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
  WorkerPermanentError,
  type WorkerPolicies,
} from './queue/consumer.js';
import { runAgentPipeline } from './agent/runner.js';

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

type FetchResponseLike = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<FetchResponseLike>;

type OutboundMessage = {
  messageId: string;
  sender: string;
  to: string;
  text: string;
};

type StartWorkerOptions = {
  processor?: IngressJobProcessor;
  registerSignalHandlers?: boolean;
  dlqQueue?: IngressDlqQueue;
};

export const extractOutboundMessageFromIngressPayload = (
  payload: unknown,
): OutboundMessage | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }

    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (!isRecord(change)) {
        continue;
      }

      const value = isRecord(change.value) ? change.value : null;
      if (!value) {
        continue;
      }

      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        if (!isRecord(message)) {
          continue;
        }

        const to = typeof message.from === 'string' ? message.from.trim() : '';
        const messageId = typeof message.id === 'string' ? message.id.trim() : '';
        const sender = to;
        const textNode = isRecord(message.text) ? message.text : null;
        const text = textNode && typeof textNode.body === 'string' ? textNode.body.trim() : '';

        if (to && text) {
          return { messageId, sender, to, text };
        }
      }
    }
  }

  return null;
};

export const buildAutoReplyText = (inboundText: string) =>
  `Terima kasih, pesan kamu sudah kami terima: ${inboundText}`;

export const sendWhatsAppTextMessage = async (
  input: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    text: string;
  },
  fetchImpl: FetchLike,
) => {
  const endpoint = `https://graph.facebook.com/v22.0/${input.phoneNumberId}/messages`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'text',
      text: {
        body: input.text,
      },
    }),
  });

  if (response.ok) {
    return;
  }

  const responseBody = await response.text();
  const message = `WhatsApp outbound failed with status ${response.status}: ${responseBody}`;

  if (response.status >= 400 && response.status < 500) {
    throw new WorkerPermanentError(message);
  }

  throw new Error(message);
};

export const createDefaultProcessor =
  (
    env: {
      WHATSAPP_PHONE_NUMBER_ID: string;
      WHATSAPP_ACCESS_TOKEN: string;
    },
    fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
  ): IngressJobProcessor =>
  async (job: IngressJobPayload) => {
    if (typeof fetchImpl !== 'function') {
      throw new Error('Global fetch is not available in this runtime');
    }

    const outboundMessage = extractOutboundMessageFromIngressPayload(job.payload);

    logger.info(
      {
        event: 'worker.job.processed',
        eventKey: job.eventKey,
        schemaVersion: job.schemaVersion,
        traceId: job.traceContext?.traceId,
        correlationId: job.traceContext?.correlationId,
      },
      'worker.job.processed',
    );

    if (!outboundMessage) {
      logger.info(
        {
          event: 'worker.outbound.skipped',
          eventKey: job.eventKey,
          reason: 'no_inbound_text_message',
          traceId: job.traceContext?.traceId,
          correlationId: job.traceContext?.correlationId,
        },
        'worker.outbound.skipped',
      );
      return;
    }

    const pipelineStartTime = Date.now();
    logger.info(
      {
        event: 'agent.pipeline.start',
        eventKey: job.eventKey,
        messageId: outboundMessage.messageId || null,
        sender: outboundMessage.sender,
        traceId: job.traceContext?.traceId,
        correlationId: job.traceContext?.correlationId,
      },
      'agent.pipeline.start',
    );

    let outboundText = buildAutoReplyText(outboundMessage.text);
    let pipelineRoute: 'llm' | 'fallback' = 'fallback';
    let pipelineMetadata: Record<string, unknown> = { reason: 'default_fallback' };

    try {
      const result = await runAgentPipeline({
        message: outboundMessage.text,
        // Phase 1 temporary correlation key until persistence-backed conversation IDs are wired.
        conversationId: outboundMessage.sender,
        sender: outboundMessage.sender,
      });

      pipelineRoute = result.route;
      pipelineMetadata = result.metadata;

      if (result.text.trim() !== '') {
        outboundText = result.text;
      }
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      const classifiedError = classifyWorkerError(normalizedError);
      const isPermanentError = classifiedError.errorClass === 'permanent';

      logger.error(
        {
          event: 'agent.pipeline.failure',
          eventKey: job.eventKey,
          messageId: outboundMessage.messageId || null,
          sender: outboundMessage.sender,
          error: normalizedError.message,
          errorClass: classifiedError.errorClass,
          willRetry: !isPermanentError,
          durationMs: Date.now() - pipelineStartTime,
          traceId: job.traceContext?.traceId,
          correlationId: job.traceContext?.correlationId,
        },
        'agent.pipeline.failure',
      );

      if (isPermanentError) {
        throw normalizedError;
      }

      pipelineRoute = 'fallback';
      pipelineMetadata = {
        reason: 'pipeline_error',
        errorClass: classifiedError.errorClass,
      };
      outboundText = buildAutoReplyText(outboundMessage.text);
    }

    logger.info(
      {
        event: 'agent.pipeline.success',
        eventKey: job.eventKey,
        messageId: outboundMessage.messageId || null,
        route: pipelineRoute,
        durationMs: Date.now() - pipelineStartTime,
        metadata: pipelineMetadata,
        traceId: job.traceContext?.traceId,
        correlationId: job.traceContext?.correlationId,
      },
      'agent.pipeline.success',
    );

    await sendWhatsAppTextMessage(
      {
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: env.WHATSAPP_ACCESS_TOKEN,
        to: outboundMessage.to,
        text: outboundText,
      },
      fetchImpl,
    );

    logger.info(
      {
        event: 'worker.outbound.sent',
        eventKey: job.eventKey,
        to: outboundMessage.to,
        traceId: job.traceContext?.traceId,
        correlationId: job.traceContext?.correlationId,
      },
      'worker.outbound.sent',
    );
  };

export const startWorker = (
  runtimeEnv: NodeJS.ProcessEnv,
  options: StartWorkerOptions = {},
): WorkerService => {
  const env = validateEnv(runtimeEnv);
  const policies = resolveWorkerPolicies(env);
  const processor =
    options.processor ??
    createDefaultProcessor({
      WHATSAPP_PHONE_NUMBER_ID: env.WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_ACCESS_TOKEN: env.WHATSAPP_ACCESS_TOKEN,
    });
  const dlqQueue = options.dlqQueue ?? createBullMqIngressDlqQueue(env.REDIS_URL);
  const worker = createIngressQueueWorker({
    redisUrl: env.REDIS_URL,
    policies,
    processor,
  });

  const mainQueue = new Queue(INGRESS_QUEUE_NAME, {
    connection: { url: env.REDIS_URL },
  });
  let previousQueueDepth = 0;

  const queueDepthMetricsInterval = setInterval(() => {
    mainQueue
      .getJobCounts()
      .then((counts) => {
        const queueDepth =
          (counts.active ?? 0) +
          (counts.waiting ?? 0) +
          (counts.prioritized ?? 0) +
          (counts.delayed ?? 0) +
          (counts.waitingChildren ?? 0);
        const queueDepthDelta = queueDepth - previousQueueDepth;
        appMetrics.queueDepth.add(queueDepthDelta, {
          queue: INGRESS_QUEUE_NAME,
        });
        previousQueueDepth = queueDepth;

        logger.info(
          {
            event: 'worker.queue.depth',
            worker: workerName,
            queueName: INGRESS_QUEUE_NAME,
            counts,
          },
          'worker.queue.depth',
        );
      })
      .catch((error: unknown) => {
        logger.error(
          {
            event: 'worker.queue.depth.error',
            worker: workerName,
            message: error instanceof Error ? error.message : String(error),
          },
          'worker.queue.depth.error',
        );
      });
  }, 60000);

  worker.on('ready', () => {
    logger.info(
      {
        event: 'worker.ready',
        worker: workerName,
        queueName: INGRESS_QUEUE_NAME,
        dlqQueueName: INGRESS_DLQ_QUEUE_NAME,
        concurrency: policies.concurrency,
        jobTimeoutMs: policies.jobTimeoutMs,
        transientMaxAttempts: policies.retry.transientMaxAttempts,
        permanentMaxAttempts: policies.retry.permanentMaxAttempts,
      },
      'worker.ready',
    );
  });

  worker.on('error', (error: Error) => {
    logger.error(
      {
        event: 'worker.error',
        worker: workerName,
        message: error.message,
      },
      'worker.error',
    );
  });

  worker.on('completed', (job) => {
    const processedOn = job.processedOn;
    const finishedOn = job.finishedOn || Date.now();
    const processingLatencyMs = processedOn ? finishedOn - processedOn : null;

    logger.info(
      {
        event: 'worker.job.completed',
        worker: workerName,
        queueName: INGRESS_QUEUE_NAME,
        jobId: job?.id ?? null,
        jobName: job?.name ?? null,
        attemptsMade: job?.attemptsMade ?? 0,
        processingLatencyMs,
      },
      'worker.job.completed',
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
          logger.warn(
            {
              ...baseLogData,
              event: 'worker.job.retried',
            },
            'worker.job.retried',
          );
        } else {
          logger.error(
            {
              ...baseLogData,
              event: 'worker.job.failed',
            },
            'worker.job.failed',
          );
        }

        if (routeResult.routedToDlq) {
          logger.error(
            {
              event: 'worker.dlq.inflow.alert',
              worker: workerName,
              jobId: baseLogData.jobId,
              dlqJobId: baseLogData.dlqJobId,
              reason: 'retries_exhausted',
              message: 'Job exhausted all retries and was routed to DLQ',
            },
            'worker.dlq.inflow.alert',
          );
        }
      })
      .catch((routeError: unknown) => {
        logger.error(
          {
            event: 'worker.job.failed.logging_error',
            worker: workerName,
            message: routeError instanceof Error ? routeError.message : String(routeError),
          },
          'worker.job.failed.logging_error',
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
            logger.error(
              {
                event: 'worker.shutdown.failed',
                worker: workerName,
                signal,
                message,
              },
              'worker.shutdown.failed',
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
