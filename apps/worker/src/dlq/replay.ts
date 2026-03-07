import dotenv from 'dotenv';
import { Queue, type JobsOptions } from 'bullmq';
import { resolveWorkerRetryPolicy, type WorkerRetryPolicy, validateEnv } from '@wa-chat/config';
import {
  INGRESS_JOB_NAME,
  INGRESS_QUEUE_NAME,
  INGRESS_DLQ_QUEUE_NAME,
  assertIngressDlqJobPayload,
  assertIngressJobPayload,
  coerceJsonValue,
  type IngressDlqJobPayload,
  type IngressJobPayload,
  type JsonValue,
} from '@wa-chat/shared';
import { pathToFileURL } from 'node:url';

dotenv.config();

export const DLQ_REPLAY_CONFIRM_TOKEN = 'REPLAY_DLQ';
export const DEFAULT_DLQ_REPLAY_LIMIT = 10;
export const MAX_DLQ_REPLAY_LIMIT = 25;
export const DEFAULT_DLQ_REPLAY_MAX_AGE_MINUTES = 1_440;
export const MAX_DLQ_REPLAY_MAX_AGE_MINUTES = 10_080;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePositiveInteger = (value: string, flagName: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }

  return parsed;
};

const parseBoundedPositiveInteger = (
  value: string,
  flagName: string,
  minimum: number,
  maximum: number,
) => {
  const parsed = parsePositiveInteger(value, flagName);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${flagName} must be between ${minimum} and ${maximum}`);
  }

  return parsed;
};

const parseOptionalFlagValue = (arg: string, flag: string) => {
  const prefix = `${flag}=`;
  if (!arg.startsWith(prefix)) {
    return null;
  }

  return arg.slice(prefix.length).trim();
};

export type DlqReplayCliArgs = {
  jobId: string | null;
  eventKey: string | null;
  actor: string;
  reason: string;
  execute: boolean;
  allowBulk: boolean;
  limit: number;
  maxAgeMinutes: number;
  confirm: string | null;
};

export const parseDlqReplayCliArgs = (argv: string[]): DlqReplayCliArgs => {
  const parsed: DlqReplayCliArgs = {
    jobId: null,
    eventKey: null,
    actor: '',
    reason: '',
    execute: false,
    allowBulk: false,
    limit: DEFAULT_DLQ_REPLAY_LIMIT,
    maxAgeMinutes: DEFAULT_DLQ_REPLAY_MAX_AGE_MINUTES,
    confirm: null,
  };

  for (const arg of argv) {
    if (arg === '--execute') {
      parsed.execute = true;
      continue;
    }

    if (arg === '--allow-bulk') {
      parsed.allowBulk = true;
      continue;
    }

    const jobId = parseOptionalFlagValue(arg, '--job-id');
    if (jobId !== null) {
      parsed.jobId = jobId;
      continue;
    }

    const eventKey = parseOptionalFlagValue(arg, '--event-key');
    if (eventKey !== null) {
      parsed.eventKey = eventKey;
      continue;
    }

    const actor = parseOptionalFlagValue(arg, '--actor');
    if (actor !== null) {
      parsed.actor = actor;
      continue;
    }

    const reason = parseOptionalFlagValue(arg, '--reason');
    if (reason !== null) {
      parsed.reason = reason;
      continue;
    }

    const confirm = parseOptionalFlagValue(arg, '--confirm');
    if (confirm !== null) {
      parsed.confirm = confirm;
      continue;
    }

    const limit = parseOptionalFlagValue(arg, '--limit');
    if (limit !== null) {
      parsed.limit = parseBoundedPositiveInteger(limit, '--limit', 1, MAX_DLQ_REPLAY_LIMIT);
      continue;
    }

    const maxAgeMinutes = parseOptionalFlagValue(arg, '--max-age-minutes');
    if (maxAgeMinutes !== null) {
      parsed.maxAgeMinutes = parseBoundedPositiveInteger(
        maxAgeMinutes,
        '--max-age-minutes',
        1,
        MAX_DLQ_REPLAY_MAX_AGE_MINUTES,
      );
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  parsed.jobId = parsed.jobId && parsed.jobId.trim() !== '' ? parsed.jobId.trim() : null;
  parsed.eventKey = parsed.eventKey && parsed.eventKey.trim() !== '' ? parsed.eventKey.trim() : null;
  parsed.actor = parsed.actor.trim();
  parsed.reason = parsed.reason.trim();
  parsed.confirm = parsed.confirm && parsed.confirm.trim() !== '' ? parsed.confirm.trim() : null;

  if (!parsed.execute) {
    throw new Error('Replay requires --execute (dry-run mode is disabled for safety)');
  }

  if (parsed.confirm !== DLQ_REPLAY_CONFIRM_TOKEN) {
    throw new Error(
      `Replay requires --confirm=${DLQ_REPLAY_CONFIRM_TOKEN} to acknowledge destructive dequeue action`,
    );
  }

  if (parsed.actor.length < 3) {
    throw new Error('Replay requires --actor with at least 3 characters');
  }

  if (parsed.reason.length < 8) {
    throw new Error('Replay requires --reason with at least 8 characters');
  }

  if (!parsed.jobId && !parsed.eventKey && !parsed.allowBulk) {
    throw new Error(
      'Replay requires --job-id, --event-key, or explicit --allow-bulk to prevent accidental mass replay',
    );
  }

  return parsed;
};

const toNullableString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

const toNullableNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export type DlqReplayAuditEntry = {
  ts: string;
  level: 'info' | 'warn' | 'error';
  event: 'worker.dlq.replay.audit';
  action: string;
  actor: string;
  reason: string;
  queueName: string;
  dlqJobId: string | null;
  eventKey: string | null;
  status: 'replayed' | 'skipped' | 'failed' | 'summary';
  guardrail: string | null;
  details: JsonValue;
};

export const emitDlqReplayAuditLog = (entry: Omit<DlqReplayAuditEntry, 'ts' | 'event'>) => {
  const payload: DlqReplayAuditEntry = {
    ts: new Date().toISOString(),
    event: 'worker.dlq.replay.audit',
    ...entry,
  };
  const serialized = JSON.stringify(payload);

  if (payload.level === 'error') {
    console.error(serialized);
    return;
  }

  if (payload.level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
};

export type DlqReplayCandidateEvaluation = {
  eventKey: string | null;
  dlqPayload: IngressDlqJobPayload | null;
  ingressPayload: IngressJobPayload | null;
  skipReason: string | null;
};

export const evaluateDlqReplayCandidate = (input: {
  rawData: unknown;
  eventKeyFilter: string | null;
  maxAgeMinutes: number;
  nowMs?: number;
}): DlqReplayCandidateEvaluation => {
  let dlqPayload: IngressDlqJobPayload;

  try {
    dlqPayload = assertIngressDlqJobPayload(input.rawData);
  } catch {
    return {
      eventKey: null,
      dlqPayload: null,
      ingressPayload: null,
      skipReason: 'invalid_dlq_payload',
    };
  }

  if (input.eventKeyFilter && dlqPayload.eventKey !== input.eventKeyFilter) {
    return {
      eventKey: dlqPayload.eventKey,
      dlqPayload,
      ingressPayload: null,
      skipReason: 'event_key_mismatch',
    };
  }

  const failedAtMs = Date.parse(dlqPayload.failure.failedAt);
  if (Number.isNaN(failedAtMs)) {
    return {
      eventKey: dlqPayload.eventKey,
      dlqPayload,
      ingressPayload: null,
      skipReason: 'invalid_failed_at',
    };
  }

  const nowMs = input.nowMs ?? Date.now();
  if (failedAtMs > nowMs) {
    return {
      eventKey: dlqPayload.eventKey,
      dlqPayload,
      ingressPayload: null,
      skipReason: 'future_failed_at',
    };
  }

  const ageMinutes = (nowMs - failedAtMs) / 60_000;
  if (ageMinutes > input.maxAgeMinutes) {
    return {
      eventKey: dlqPayload.eventKey,
      dlqPayload,
      ingressPayload: null,
      skipReason: 'too_old',
    };
  }

  let ingressPayload: IngressJobPayload;
  try {
    ingressPayload = assertIngressJobPayload(dlqPayload.originalJob.data);
  } catch {
    return {
      eventKey: dlqPayload.eventKey,
      dlqPayload,
      ingressPayload: null,
      skipReason: 'invalid_original_job_payload',
    };
  }

  return {
    eventKey: dlqPayload.eventKey,
    dlqPayload,
    ingressPayload,
    skipReason: null,
  };
};

export const resolveReplayJobOptions = (
  dlqPayload: IngressDlqJobPayload,
  retryPolicy: WorkerRetryPolicy,
): JobsOptions => {
  const attempts = dlqPayload.originalJob.retry.attempts ?? retryPolicy.transient.maxAttempts;
  const backoffType = dlqPayload.originalJob.retry.backoffType ?? 'exponential';
  const backoffDelayMs =
    dlqPayload.originalJob.retry.backoffDelayMs ?? retryPolicy.transient.backoffDelayMs;
  const backoffJitter =
    dlqPayload.originalJob.retry.backoffJitter ?? retryPolicy.transient.backoffJitter;

  const options: JobsOptions = {
    attempts,
    removeOnComplete: true,
    removeOnFail: false,
  };

  if (backoffDelayMs >= 0 && backoffType) {
    const backoff: {
      type: string;
      delay: number;
      jitter?: number;
    } = {
      type: backoffType,
      delay: backoffDelayMs,
    };

    if (backoffJitter !== null) {
      backoff.jitter = backoffJitter;
    }

    options.backoff = backoff;
  }

  return options;
};

type DlqJobLike = {
  id: string | number | undefined;
  data: unknown;
  remove: () => Promise<void>;
};

type DlqQueueLike = {
  getJob: (id: string) => Promise<DlqJobLike | null>;
  getJobs: (
    types: Array<'wait' | 'paused' | 'prioritized' | 'delayed'>,
    start: number,
    end: number,
    asc?: boolean,
  ) => Promise<DlqJobLike[]>;
  close: () => Promise<void>;
};

type IngressQueueLike = {
  add: (name: string, data: IngressJobPayload, opts?: JobsOptions) => Promise<unknown>;
  close: () => Promise<void>;
};

export type DlqReplaySummary = {
  inspected: number;
  replayed: number;
  skipped: number;
  failed: number;
};

const resolveDetails = (value: unknown): JsonValue => {
  if (isRecord(value)) {
    const normalized: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = coerceJsonValue(entry);
    }
    return normalized;
  }

  return coerceJsonValue(value);
};

export const runDlqReplay = async (input: {
  argv: string[];
  env: NodeJS.ProcessEnv;
  nowMs?: number;
  dlqQueue?: DlqQueueLike;
  ingressQueue?: IngressQueueLike;
}): Promise<DlqReplaySummary> => {
  const args = parseDlqReplayCliArgs(input.argv);
  const runtimeEnv = validateEnv(input.env);
  const retryPolicy = resolveWorkerRetryPolicy(runtimeEnv);
  const nowMs = input.nowMs ?? Date.now();

  const createdDlqQueue =
    input.dlqQueue ??
    new Queue(INGRESS_DLQ_QUEUE_NAME, {
      connection: { url: runtimeEnv.REDIS_URL },
    });
  const createdIngressQueue =
    input.ingressQueue ??
    new Queue(INGRESS_QUEUE_NAME, {
      connection: { url: runtimeEnv.REDIS_URL },
    });

  const dlqQueue = createdDlqQueue as DlqQueueLike;
  const ingressQueue = createdIngressQueue as IngressQueueLike;

  const summary: DlqReplaySummary = {
    inspected: 0,
    replayed: 0,
    skipped: 0,
    failed: 0,
  };

  const inspectJobs = async () => {
    if (args.jobId) {
      const job = await dlqQueue.getJob(args.jobId);
      if (!job) {
        throw new Error(`DLQ job not found: ${args.jobId}`);
      }
      return [job];
    }

    return dlqQueue.getJobs(
      ['wait', 'paused', 'prioritized', 'delayed'],
      0,
      Math.max(args.limit * 5, args.limit) - 1,
      false,
    );
  };

  try {
    const jobs = await inspectJobs();
    let selectedForReplay = 0;

    for (const job of jobs) {
      if (!args.jobId && selectedForReplay >= args.limit) {
        break;
      }

      summary.inspected += 1;
      const dlqJobId = job.id === undefined ? null : String(job.id);

      const evaluation = evaluateDlqReplayCandidate({
        rawData: job.data,
        eventKeyFilter: args.eventKey,
        maxAgeMinutes: args.maxAgeMinutes,
        nowMs,
      });

      if (evaluation.skipReason || !evaluation.dlqPayload || !evaluation.ingressPayload) {
        summary.skipped += 1;
        emitDlqReplayAuditLog({
          level: 'warn',
          action: 'job_skipped',
          actor: args.actor,
          reason: args.reason,
          queueName: INGRESS_DLQ_QUEUE_NAME,
          dlqJobId,
          eventKey: evaluation.eventKey,
          status: 'skipped',
          guardrail: evaluation.skipReason,
          details: resolveDetails({
            maxAgeMinutes: args.maxAgeMinutes,
            eventKeyFilter: args.eventKey,
          }),
        });
        continue;
      }

      selectedForReplay += 1;
      const replayOptions = resolveReplayJobOptions(evaluation.dlqPayload, retryPolicy);

      try {
        await ingressQueue.add(INGRESS_JOB_NAME, evaluation.ingressPayload, replayOptions);
        await job.remove();
        summary.replayed += 1;
        emitDlqReplayAuditLog({
          level: 'info',
          action: 'job_replayed',
          actor: args.actor,
          reason: args.reason,
          queueName: INGRESS_DLQ_QUEUE_NAME,
          dlqJobId,
          eventKey: evaluation.dlqPayload.eventKey,
          status: 'replayed',
          guardrail: null,
          details: resolveDetails({
            destinationQueue: INGRESS_QUEUE_NAME,
            maxAgeMinutes: args.maxAgeMinutes,
            replayAttempts: toNullableNumber(replayOptions.attempts) ?? null,
            replayBackoffType: isRecord(replayOptions.backoff)
              ? toNullableString(replayOptions.backoff.type)
              : null,
            replayBackoffDelayMs: isRecord(replayOptions.backoff)
              ? toNullableNumber(replayOptions.backoff.delay)
              : null,
          }),
        });
      } catch (error: unknown) {
        summary.failed += 1;
        emitDlqReplayAuditLog({
          level: 'error',
          action: 'job_replay_failed',
          actor: args.actor,
          reason: args.reason,
          queueName: INGRESS_DLQ_QUEUE_NAME,
          dlqJobId,
          eventKey: evaluation.dlqPayload.eventKey,
          status: 'failed',
          guardrail: null,
          details: resolveDetails({
            error: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    }

    emitDlqReplayAuditLog({
      level: summary.failed > 0 ? 'warn' : 'info',
      action: 'replay_summary',
      actor: args.actor,
      reason: args.reason,
      queueName: INGRESS_DLQ_QUEUE_NAME,
      dlqJobId: null,
      eventKey: null,
      status: 'summary',
      guardrail: null,
      details: resolveDetails({
        inspected: summary.inspected,
        replayed: summary.replayed,
        skipped: summary.skipped,
        failed: summary.failed,
      }),
    });

    return summary;
  } finally {
    await dlqQueue.close();
    await ingressQueue.close();
  }
};

const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entrypointUrl === import.meta.url) {
  runDlqReplay({
    argv: process.argv.slice(2),
    env: process.env,
  })
    .then((summary) => {
      if (summary.failed > 0) {
        process.exit(1);
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          event: 'worker.dlq.replay.failed',
          message,
        }),
      );
      process.exit(1);
    });
}
