import { describe, it, expect } from 'vitest';
import { metricsRepository } from './metrics.js';

describe('MetricsRepository', () => {
  it('should return mocked J4 KPIs', async () => {
    const kpis = await metricsRepository.getDashboardKPIs();
    expect(kpis.volume).toBeDefined();
    expect(kpis.queue).toBeDefined();
    expect(kpis.latency).toBeDefined();
    expect(kpis.rates).toBeDefined();
    expect(kpis.updatedAt).toBeDefined();

    expect(kpis.queue.dlqCount).toBeGreaterThanOrEqual(0);
    expect(kpis.volume.totalInbound).toBeGreaterThan(0);
  });
});
