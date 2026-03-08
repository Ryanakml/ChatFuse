import express from 'express';
import { Registry, Counter, Histogram } from 'prom-client';

const customRegistry = new Registry();

// Define metrics
const apiRequestCount = new Counter({
  name: 'api_request_count_total',
  help: 'Total number of API requests',
  labelNames: ['route', 'status'],
  registers: [customRegistry],
});

const apiLatency = new Histogram({
  name: 'api_latency_ms',
  help: 'API request latency in milliseconds',
  labelNames: ['route', 'method'],
  buckets: [100, 500, 1000, 1500, 2000, 5000],
  registers: [customRegistry],
});

const queueDlqCount = new Counter({
  name: 'queue_dlq_count_total',
  help: 'Total number of jobs sent to DLQ',
  registers: [customRegistry],
});

const agentProviderFallbackCount = new Counter({
  name: 'agent_provider_fallback_count_total',
  help: 'Total number of provider fallbacks triggered',
  registers: [customRegistry],
});

const agentPathCount = new Counter({
  name: 'agent_path_count_total',
  help: 'Agent path execution count (by path type)',
  labelNames: ['path'],
  registers: [customRegistry],
});

// Start exposed metrics server
const app = express();
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', customRegistry.contentType);
  res.end(await customRegistry.metrics());
});

const server = app.listen(9091, () => {
  console.log('Metrics simulator listening on port 9091 for Prometheus scraping.');
});

async function simulate() {
  console.log('Starting K3 Alert Simulation...');
  let i = 0;
  try {
    while (true) {
      i++;
      if (i % 5 === 0) {
        console.log(`Sending metrics batch ${i}`);
      }

      // 1. Webhook Verification Failure Spike (needs > 10 in 5m)
      // Sending 1x per second = 300 in 5m => triggers alert
      apiRequestCount.inc({ route: '/webhook', status: '401' }, 1);

      // 2. ACK Latency Breach (p95 > 1500ms)
      // Sending big values > 1500ms to skew the p95
      apiLatency.observe({ method: 'POST', route: '/webhook' }, 1800);
      apiLatency.observe({ method: 'POST', route: '/webhook' }, 2000);

      // 3. DLQ Spike (needs > 5 in 5m)
      queueDlqCount.inc(1);

      // 4. Provider Fallback Surge (needs > 3 in 5m)
      agentProviderFallbackCount.inc(1);

      // 5. Escalation Ratio Spike (needs > 20% in 15m)
      agentPathCount.inc({ path: 'escalation' }, 3);
      agentPathCount.inc({ path: 'normal' }, 7); // 30% escalation ratio

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error('Simulation error:', error);
  }
}

simulate();

process.on('SIGINT', () => {
  console.log('\nSutdown requested, stopping metrics server...');
  server.close(() => process.exit(0));
});
