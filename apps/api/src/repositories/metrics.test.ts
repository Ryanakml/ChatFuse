import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  metricsRepository,
  setMetricsClient,
  setMetricsQueueHealthProvider,
} from './metrics.js';

const makeMockClient = () => {
  const from = (table: string) => {
    if (table === 'messages') {
      return {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        select: (_columns: string, _options: { head: boolean; count: 'exact' }) => {
          const state = { direction: null as string | null };
          const query: {
            eq: (column: string, value: string) => typeof query;
            gte: (column: string, value: string) => Promise<{ count: number; error: null }>;
          } = {
            eq: (column, value) => {
              if (column === 'direction') {
                state.direction = value;
              }
              return query;
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            gte: (_column, _value) =>
              Promise.resolve({
                count: state.direction === 'inbound' ? 8 : 5,
                error: null,
              }),
          };
          return query;
        },
      };
    }

    if (table === 'agent_events') {
      return {
        select: (columns: string) => ({
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          eq: (_column: string, _value: string) => {
            if (columns.includes('route:payload->>route')) {
              return Promise.resolve({
                data: [
                  { route: 'fallback' },
                  { route: 'fallback' },
                  { route: 'rag_path' },
                  { route: 'escalation_path' },
                ],
                error: null,
              });
            }
            return Promise.resolve({
              data: [
                { duration_ms: '100' },
                { duration_ms: '200' },
                { duration_ms: '300' },
                { duration_ms: '400' },
              ],
              error: null,
            });
          },
        }),
      };
    }

    if (table === 'conversations') {
      return {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        select: (_columns: string, _options: { head: boolean; count: 'exact' }) => ({
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          not: (_column: string, _operator: string, _value: null) =>
            Promise.resolve({ count: 3, error: null }),
        }),
      };
    }

    return {
      select: () => Promise.resolve({ data: [], error: null }),
    };
  };

  return { from } as unknown as SupabaseClient;
};

beforeEach(() => {
  setMetricsClient(makeMockClient());
  setMetricsQueueHealthProvider(async () => ({
    activeJobs: 4,
    waitingJobs: 2,
    failedJobs: 1,
    dlqCount: 0,
  }));
});

describe('MetricsRepository', () => {
  it('returns real-shaped KPI metrics from repository aggregations', async () => {
    const kpis = await metricsRepository.getDashboardKPIs();

    expect(kpis.volume.totalInbound).toBeGreaterThan(0);
    expect(kpis.volume.totalOutbound).toBeGreaterThan(0);
    expect(kpis.queue.activeJobs).toBe(4);
    expect(kpis.latency.p95).toBeGreaterThan(0);
    expect(kpis.rates.fallbackRate).toBe(0.5);
    expect(kpis.rates.escalationRate).toBe(0.25);
    expect(kpis.rates.totalEscalations).toBe(3);
    expect(new Date(kpis.updatedAt).toString()).not.toBe('Invalid Date');
  });
});
