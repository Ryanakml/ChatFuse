/**
 * Load Test: POST /webhook (L2 – Load)
 *
 * Runs three load profiles against a locally running API server:
 *   - normal_peak:  50 rps for 60 seconds
 *   - burst_peak:  200 rps for 10 seconds
 *   - soak:         30 rps for 300 seconds
 *
 * Usage:
 *   LOAD_PROFILE=normal_peak node --import tsx tests/load/load-test.ts
 *   LOAD_PROFILE=burst_peak  node --import tsx tests/load/load-test.ts
 *   LOAD_PROFILE=soak        node --import tsx tests/load/load-test.ts
 *
 * Requires:
 *   1. API server running locally (npm run dev:api or direct node command)
 *   2. Docker infra up (npm run dev:infra)
 *   3. Env var API_BASE_URL (default: http://localhost:3000)
 *
 * The test uses Node.js native fetch (no autocannon dependency required).
 * Workers and the LLM pipeline should be mocked / pointed at stubs to avoid
 * real LLM calls during load testing.
 *
 * Exits with code 1 if the chosen profile fails its acceptance thresholds.
 */
import { createHmac } from 'node:crypto';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? 'dev-secret';
const PROFILE_NAME = (process.env.LOAD_PROFILE ?? 'normal_peak') as keyof typeof PROFILES;

interface LoadProfile {
  /** Target requests per second */
  targetRps: number;
  /** Duration in seconds */
  durationSec: number;
  /** Maximum acceptable p95 latency in milliseconds */
  maxP95Ms: number;
  /** Maximum acceptable error rate (0–1) */
  maxErrorRate: number;
}

const PROFILES: Record<string, LoadProfile> = {
  normal_peak: {
    targetRps: 50,
    durationSec: 60,
    maxP95Ms: 1500, // From SLO: p95 webhook ACK <= 1.5s
    maxErrorRate: 0.001, // <= 0.1% error rate
  },
  burst_peak: {
    targetRps: 200,
    durationSec: 10,
    maxP95Ms: 2500, // Relaxed for burst; SLO is a p95 target under normal load
    maxErrorRate: 0.01,
  },
  soak: {
    targetRps: 30,
    durationSec: 300,
    maxP95Ms: 1500,
    maxErrorRate: 0.001,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signBody(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

function buildWebhookPayload(msgId: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ id: msgId, type: 'text', text: { body: 'load test message' } }],
            },
          },
        ],
      },
    ],
  });
}

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedMs.length) - 1;
  return sortedMs[Math.max(0, idx)] ?? 0;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runLoadTest(profile: LoadProfile): Promise<void> {
  const { targetRps, durationSec, maxP95Ms, maxErrorRate } = profile;

  const totalRequests = targetRps * durationSec;
  const intervalMs = 1000 / targetRps;

  console.log(`\nProfile : ${PROFILE_NAME}`);
  console.log(`Target  : ${targetRps} rps × ${durationSec}s = ${totalRequests} requests`);
  console.log(`Endpoint: POST ${API_BASE_URL}/webhook`);
  console.log(`Started : ${new Date().toISOString()}\n`);

  const latenciesMs: number[] = [];
  const requestPromises: Promise<void>[] = [];
  let errorCount = 0;
  let completedCount = 0;

  const startTime = Date.now();

  for (let i = 0; i < totalRequests; i++) {
    // Throttle to maintain target RPS
    const expectedMs = i * intervalMs;
    const actualMs = Date.now() - startTime;
    if (actualMs < expectedMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, expectedMs - actualMs));
    }

    const msgId = `wamid-load-${Date.now()}-${i}`;
    const body = buildWebhookPayload(msgId);
    const signature = signBody(body, APP_SECRET);

    const reqStart = Date.now();
    const p = fetch(`${API_BASE_URL}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
      },
      body,
    })
      .then((res) => {
        const latency = Date.now() - reqStart;
        latenciesMs.push(latency);
        completedCount++;
        if (!res.ok && res.status !== 200) {
          errorCount++;
        }
      })
      .catch(() => {
        const latency = Date.now() - reqStart;
        latenciesMs.push(latency);
        completedCount++;
        errorCount++;
      });

    requestPromises.push(p);

    // Print progress every 10%
    if (i > 0 && i % Math.max(1, Math.floor(totalRequests / 10)) === 0) {
      const pct = Math.round((i / totalRequests) * 100);
      console.log(
        `  Progress: ${pct}% (${i}/${totalRequests} sent, ${completedCount} completed, ${errorCount} errors)`,
      );
    }
  }

  await Promise.all(requestPromises);

  const totalMs = Date.now() - startTime;
  const sortedMs = [...latenciesMs].sort((a, b) => a - b);

  const p50 = percentile(sortedMs, 50);
  const p95 = percentile(sortedMs, 95);
  const p99 = percentile(sortedMs, 99);
  const actualErrorRate = latenciesMs.length > 0 ? errorCount / latenciesMs.length : 0;
  const throughput = Math.round((completedCount / totalMs) * 1000);

  console.log('\n─── Results ────────────────────────────────────────────────────');
  console.log(`Completed  : ${completedCount} / ${totalRequests}`);
  console.log(`Duration   : ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Throughput : ~${throughput} rps`);
  console.log(`Errors     : ${errorCount} (${(actualErrorRate * 100).toFixed(2)}%)`);
  console.log(`Latency p50: ${p50}ms`);
  console.log(`Latency p95: ${p95}ms  [threshold: ${maxP95Ms}ms]`);
  console.log(`Latency p99: ${p99}ms`);
  console.log('────────────────────────────────────────────────────────────────\n');

  // ── Assertion / Exit ─────────────────────────────────────────────────────
  const passed = p95 <= maxP95Ms && actualErrorRate <= maxErrorRate;

  if (passed) {
    console.log(
      `✓ Load test PASSED (p95=${p95}ms <= ${maxP95Ms}ms, errorRate=${(actualErrorRate * 100).toFixed(2)}% <= ${(maxErrorRate * 100).toFixed(1)}%)`,
    );
  } else {
    console.error(`✗ Load test FAILED`);
    if (p95 > maxP95Ms) {
      console.error(`  p95 latency ${p95}ms exceeded threshold ${maxP95Ms}ms`);
    }
    if (actualErrorRate > maxErrorRate) {
      console.error(
        `  Error rate ${(actualErrorRate * 100).toFixed(2)}% exceeded threshold ${(maxErrorRate * 100).toFixed(1)}%`,
      );
    }
    process.exit(1);
  }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

const profile = PROFILES[PROFILE_NAME];
if (!profile) {
  console.error(
    `Unknown profile "${PROFILE_NAME}". Choose one of: ${Object.keys(PROFILES).join(', ')}`,
  );
  process.exit(1);
}

await runLoadTest(profile);
