export interface MessageVolumeKPI {
  totalInbound: number;
  totalOutbound: number;
}

export interface QueueHealthKPI {
  activeJobs: number;
  waitingJobs: number;
  failedJobs: number;
  dlqCount: number;
}

export interface LatencyPercentilesKPI {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface FallbackAndEscalationKPI {
  fallbackRate: number;
  escalationRate: number;
  totalEscalations: number;
}

export interface OpsDashboardKPIs {
  volume: MessageVolumeKPI;
  queue: QueueHealthKPI;
  latency: LatencyPercentilesKPI;
  rates: FallbackAndEscalationKPI;
  updatedAt: string;
}
