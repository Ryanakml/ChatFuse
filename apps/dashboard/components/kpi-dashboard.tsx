import React from 'react';
import { fetchKPIs } from '@/app/actions';
import { KpiCard } from './kpi-card';

export async function KpiDashboard() {
  const kpis = await fetchKPIs();

  if (!kpis) {
    return (
      <div className="rounded border border-red-100 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        Failed to load KPIs or unauthorized.
      </div>
    );
  }

  const { volume, queue, latency, rates } = kpis;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Volume & Queue */}
        <KpiCard
          title="Total Inbound"
          value={volume.totalInbound}
          description="Messages received"
        />
        <KpiCard title="Total Outbound" value={volume.totalOutbound} description="Messages sent" />
        <KpiCard
          title="Active Queue"
          value={queue.activeJobs}
          description="Jobs currently processing"
        />
        <KpiCard
          title="DLQ Size"
          value={queue.dlqCount}
          description="Dead Letter Queue items"
          trend={queue.dlqCount > 0 ? 'up' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Rates & Latency */}
        <KpiCard
          title="Fallback Rate"
          value={`${(rates.fallbackRate * 100).toFixed(1)}%`}
          description="LLM routing fallbacks"
        />
        <KpiCard
          title="Escalation Rate"
          value={`${(rates.escalationRate * 100).toFixed(1)}%`}
          description="Handoffs to human"
        />
        <KpiCard
          title="p95 Latency"
          value={`${latency.p95}ms`}
          description="Response turnaround time"
        />
        <KpiCard title="p99 Latency" value={`${latency.p99}ms`} description="Tail latency" />
      </div>

      <div className="text-right text-xs text-gray-400 dark:text-gray-500">
        Last updated: {new Date(kpis.updatedAt).toLocaleTimeString()}
      </div>
    </div>
  );
}
