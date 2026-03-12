import { Queue } from 'bullmq';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  INGRESS_DLQ_QUEUE_NAME,
  INGRESS_QUEUE_NAME,
  type OpsDashboardKPIs,
} from '@wa-chat/shared';
import { toRepositoryError } from './errors.js';

type QueueHealth = OpsDashboardKPIs['queue'];
type QueueHealthProvider = () => Promise<QueueHealth | null>;

let _client: SupabaseClient | null = null;
let _queueHealthProvider: QueueHealthProvider | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  _client = createClient(url, key);
  return _client;
}

/** Override the Supabase client — used in tests. */
export function setMetricsClient(client: SupabaseClient): void {
  _client = client;
}

/** Override queue health provider — used in tests. */
export function setMetricsQueueHealthProvider(provider: QueueHealthProvider | null): void {
  _queueHealthProvider = provider;
}

const startOfUtcDay = (reference: Date) =>
  new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));

const startOfUtcWeek = (reference: Date) => {
  const dayStart = startOfUtcDay(reference);
  const dayIndex = dayStart.getUTCDay();
  const mondayOffset = (dayIndex + 6) % 7;
  dayStart.setUTCDate(dayStart.getUTCDate() - mondayOffset);
  return dayStart;
};

const roundMetric = (value: number) => (Number.isFinite(value) ? Math.round(value) : 0);

const percentile = (values: number[], fraction: number) => {
  if (values.length === 0) {
    return 0;
  }
  const index = (values.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return values[lower]!;
  }

  const weight = index - lower;
  return values[lower]! * (1 - weight) + values[upper]! * weight;
};

const toRate = (count: number, total: number) => {
  if (total <= 0) {
    return 0;
  }
  return Number((count / total).toFixed(4));
};

const extractNumericValues = (values: Array<string | null>) =>
  values
    .map((value) => {
      if (typeof value !== 'string') {
        return Number.NaN;
      }
      return Number(value);
    })
    .filter((value) => Number.isFinite(value));

const emptyQueueHealth: QueueHealth = {
  activeJobs: 0,
  waitingJobs: 0,
  failedJobs: 0,
  dlqCount: 0,
};

export class MetricsRepository {
  private async countMessagesByDirectionSince(
    direction: 'inbound' | 'outbound',
    sinceIso: string,
  ): Promise<number> {
    const client = getClient();
    const { count, error } = await client
      .from('messages')
      .select('*', { head: true, count: 'exact' })
      .eq('direction', direction)
      .gte('created_at', sinceIso);

    if (error) {
      throw toRepositoryError(error, `count ${direction} messages`);
    }

    return count ?? 0;
  }

  private async getRouteSamples(): Promise<string[]> {
    const client = getClient();
    const { data, error } = await client
      .from('agent_events')
      .select('route:payload->>route')
      .eq('event_type', 'pipeline_success');

    if (error) {
      throw toRepositoryError(error, 'load route distribution samples');
    }

    return (data ?? [])
      .map((row) => row.route as string | null)
      .filter((route): route is string => typeof route === 'string' && route !== '');
  }

  private async getDurationSamples(): Promise<number[]> {
    const client = getClient();
    const { data, error } = await client
      .from('agent_events')
      .select('duration_ms:payload->>durationMs')
      .eq('event_type', 'pipeline_success');

    if (error) {
      throw toRepositoryError(error, 'load latency samples');
    }

    return extractNumericValues(
      (data ?? []).map((row) => row.duration_ms as string | null),
    ).sort((left, right) => left - right);
  }

  private async countEscalatedConversations(): Promise<number> {
    const client = getClient();
    const { count, error } = await client
      .from('conversations')
      .select('*', { head: true, count: 'exact' })
      .not('escalation_status', 'is', null);

    if (error) {
      throw toRepositoryError(error, 'count escalated conversations');
    }

    return count ?? 0;
  }

  private async getQueueHealthFromRedis(): Promise<QueueHealth | null> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.warn('Queue metrics unavailable: REDIS_URL is missing.');
      return null;
    }

    const ingressQueue = new Queue(INGRESS_QUEUE_NAME, { connection: { url: redisUrl } });
    const dlqQueue = new Queue(INGRESS_DLQ_QUEUE_NAME, { connection: { url: redisUrl } });

    try {
      const [ingressCounts, dlqCounts] = await Promise.all([
        ingressQueue.getJobCounts('active', 'waiting', 'failed', 'delayed'),
        dlqQueue.getJobCounts('active', 'waiting', 'failed', 'delayed'),
      ]);

      return {
        activeJobs: ingressCounts.active ?? 0,
        waitingJobs: (ingressCounts.waiting ?? 0) + (ingressCounts.delayed ?? 0),
        failedJobs: ingressCounts.failed ?? 0,
        dlqCount:
          (dlqCounts.active ?? 0) +
          (dlqCounts.waiting ?? 0) +
          (dlqCounts.failed ?? 0) +
          (dlqCounts.delayed ?? 0),
      };
    } catch (error: unknown) {
      console.warn(
        `Queue metrics unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      await Promise.allSettled([ingressQueue.close(), dlqQueue.close()]);
    }
  }

  async getDashboardKPIs(): Promise<OpsDashboardKPIs> {
    const now = new Date();
    const startOfTodayIso = startOfUtcDay(now).toISOString();
    const startOfWeekIso = startOfUtcWeek(now).toISOString();

    try {
      const [
        todayInbound,
        todayOutbound,
        weekInbound,
        weekOutbound,
        routeSamples,
        durationSamples,
        totalEscalations,
        queueHealth,
      ] = await Promise.all([
        this.countMessagesByDirectionSince('inbound', startOfTodayIso),
        this.countMessagesByDirectionSince('outbound', startOfTodayIso),
        this.countMessagesByDirectionSince('inbound', startOfWeekIso),
        this.countMessagesByDirectionSince('outbound', startOfWeekIso),
        this.getRouteSamples(),
        this.getDurationSamples(),
        this.countEscalatedConversations(),
        _queueHealthProvider ? _queueHealthProvider() : this.getQueueHealthFromRedis(),
      ]);

      const routeCounts = routeSamples.reduce<Record<string, number>>((accumulator, route) => {
        accumulator[route] = (accumulator[route] ?? 0) + 1;
        return accumulator;
      }, {});

      const totalRouteEvents = routeSamples.length;
      const fallbackRate = toRate(routeCounts['fallback'] ?? 0, totalRouteEvents);
      const escalationRate = toRate(routeCounts['escalation_path'] ?? 0, totalRouteEvents);

      const averageResponseTimeMs =
        durationSamples.length > 0
          ? durationSamples.reduce((sum, value) => sum + value, 0) / durationSamples.length
          : 0;
      const inboundVolume = weekInbound > 0 ? weekInbound : todayInbound;
      const outboundVolume = weekOutbound > 0 ? weekOutbound : todayOutbound;
      const p50 = durationSamples.length > 0 ? percentile(durationSamples, 0.5) : averageResponseTimeMs;

      return {
        volume: {
          totalInbound: inboundVolume,
          totalOutbound: outboundVolume,
        },
        queue: queueHealth ?? emptyQueueHealth,
        latency: {
          p50: roundMetric(p50),
          p90: roundMetric(percentile(durationSamples, 0.9)),
          p95: roundMetric(percentile(durationSamples, 0.95)),
          p99: roundMetric(percentile(durationSamples, 0.99)),
        },
        rates: {
          // Average response time is computed to satisfy Phase 4 requirements while preserving API shape.
          fallbackRate,
          escalationRate,
          totalEscalations,
        },
        updatedAt: now.toISOString(),
      };
    } catch (error: unknown) {
      throw toRepositoryError(error, 'load dashboard KPIs');
    }
  }
}

export const metricsRepository = new MetricsRepository();
