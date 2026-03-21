/**
 * Acceptance Test Suite: Webhook -> Queue -> Worker -> Persistence (Phase 5)
 *
 * Scope:
 * - Test A: Happy path with seeded RAG data and grounded response assertion
 * - Test B: Duplicate idempotency end-to-end (single side effects)
 * - Test C: Provider fallback simulation (primary fails, fallback succeeds)
 *
 * Notes:
 * - Uses an in-memory Supabase client stub (no external DB dependency).
 * - Uses stubbed embeddings/vector-search for deterministic RAG behavior in CI.
 * - Uses worker dependency injection to stub agent-runner behavior without real LLM API calls.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type {
  IdempotencyStore,
  IngressJobPayload,
  IngressObservability,
  IngressQueue,
  IngressTraceContext,
} from '../../apps/api/src/index.js';
import { createApp } from '../../apps/api/src/index.js';
import { createDefaultProcessor } from '../../apps/worker/src/index.js';
import { runIngressJob } from '../../apps/worker/src/queue/consumer.js';
import type { AgentRunnerResult } from '../../apps/worker/src/agent/runner.js';
import { setMessageStoreClient } from '../../apps/worker/src/repositories/message-store.js';
import { INGRESS_JOB_NAME } from '@wa-chat/shared';

const color = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

type TableRows = {
  users: Array<Record<string, unknown>>;
  conversations: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  agent_events: Array<Record<string, unknown>>;
  tool_calls: Array<Record<string, unknown>>;
  knowledge_chunks: Array<Record<string, unknown>>;
};

type Filter = {
  column: string;
  value: unknown;
};

const cloneRow = (row: Record<string, unknown>): Record<string, unknown> => ({ ...row });

const parseColumns = (columns?: string): string[] => {
  if (!columns) {
    return [];
  }

  return columns
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
};

const selectColumns = (row: Record<string, unknown>, columns?: string): Record<string, unknown> => {
  const parsedColumns = parseColumns(columns);
  if (parsedColumns.length === 0) {
    return cloneRow(row);
  }

  const selected: Record<string, unknown> = {};
  for (const column of parsedColumns) {
    selected[column] = row[column];
  }
  return selected;
};

const applyFilters = (
  rows: Array<Record<string, unknown>>,
  filters: Filter[],
): Array<Record<string, unknown>> =>
  rows.filter((row) => filters.every((filter) => row[filter.column] === filter.value));

const createInMemorySupabaseClient = (): {
  client: Parameters<typeof setMessageStoreClient>[0];
  tables: TableRows;
  seedKnowledgeChunk: (input: {
    content: string;
    metadata?: Record<string, unknown>;
    embedding?: number[];
  }) => Promise<void>;
} => {
  const tables: TableRows = {
    users: [],
    conversations: [],
    messages: [],
    agent_events: [],
    tool_calls: [],
    knowledge_chunks: [],
  };

  const idCounters = new Map<string, number>();
  const nextId = (prefix: string): string => {
    const value = (idCounters.get(prefix) ?? 0) + 1;
    idCounters.set(prefix, value);
    return `${prefix}_${value}`;
  };

  const buildSelectQuery = (tableName: keyof TableRows, columns?: string) => {
    const filters: Filter[] = [];
    let rowLimit: number | null = null;

    const runQuery = (): Array<Record<string, unknown>> => {
      const filtered = applyFilters(tables[tableName], filters).map((row) =>
        selectColumns(row, columns),
      );
      if (typeof rowLimit === 'number') {
        return filtered.slice(0, rowLimit);
      }
      return filtered;
    };

    const query = {
      eq(column: string, value: unknown) {
        filters.push({ column, value });
        return query;
      },
      limit(limit: number) {
        rowLimit = limit;
        return query;
      },
      async maybeSingle() {
        const rows = runQuery();
        return {
          data: rows[0] ?? null,
          error: null,
        };
      },
      async single() {
        const rows = runQuery();
        if (rows.length === 0) {
          return {
            data: null,
            error: { message: 'No rows found' },
          };
        }
        return {
          data: rows[0],
          error: null,
        };
      },
      then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
        return Promise.resolve({ data: runQuery(), error: null }).then(resolve);
      },
    };

    return query;
  };

  const buildInsertBuilder = (
    tableName: keyof TableRows,
    values: Record<string, unknown> | Array<Record<string, unknown>>,
  ) => {
    let executed = false;
    let result: {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: unknown;
    } = {
      data: null,
      error: null,
    };

    const execute = () => {
      if (executed) {
        return result;
      }
      executed = true;

      const inputRows = Array.isArray(values) ? values : [values];
      const insertedRows: Array<Record<string, unknown>> = [];

      for (const rawRow of inputRows) {
        const row = cloneRow(rawRow);

        if (tableName === 'messages') {
          const inboundMessageId =
            typeof row['whatsapp_message_id'] === 'string' ? row['whatsapp_message_id'] : null;
          if (
            inboundMessageId &&
            tables.messages.some((existing) => existing['whatsapp_message_id'] === inboundMessageId)
          ) {
            result = {
              data: null,
              error: {
                code: '23505',
                message: 'duplicate key value violates unique constraint',
              },
            };
            return result;
          }
        }

        const idPrefixByTable: Record<keyof TableRows, string> = {
          users: 'user',
          conversations: 'conv',
          messages: 'msg',
          agent_events: 'evt',
          tool_calls: 'tool',
          knowledge_chunks: 'chunk',
        };

        if (typeof row['id'] !== 'string' || row['id'] === '') {
          row['id'] = nextId(idPrefixByTable[tableName]);
        }

        tables[tableName].push(row);
        insertedRows.push(row);
      }

      result = {
        data: Array.isArray(values) ? insertedRows : (insertedRows[0] ?? null),
        error: null,
      };
      return result;
    };

    const builder = {
      select(columns?: string) {
        return {
          async maybeSingle() {
            const execution = execute();
            if (execution.error) {
              return { data: null, error: execution.error };
            }
            const row = Array.isArray(execution.data) ? execution.data[0] : execution.data;
            return {
              data: row ? selectColumns(row, columns) : null,
              error: null,
            };
          },
          async single() {
            const execution = execute();
            if (execution.error) {
              return { data: null, error: execution.error };
            }
            const row = Array.isArray(execution.data) ? execution.data[0] : execution.data;
            if (!row) {
              return {
                data: null,
                error: { message: 'No rows inserted' },
              };
            }
            return {
              data: selectColumns(row, columns),
              error: null,
            };
          },
        };
      },
      then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
        return Promise.resolve(execute()).then(resolve);
      },
    };

    return builder;
  };

  const buildUpsertBuilder = (
    tableName: keyof TableRows,
    values: Record<string, unknown>,
    options?: { onConflict?: string },
  ) => {
    let executed = false;
    let result: { data: Record<string, unknown> | null; error: unknown } = {
      data: null,
      error: null,
    };

    const execute = () => {
      if (executed) {
        return result;
      }
      executed = true;

      if (tableName !== 'users') {
        result = { data: null, error: { message: 'upsert is only stubbed for users' } };
        return result;
      }

      const row = cloneRow(values);
      const conflictColumn = options?.onConflict ?? 'phone_number';
      const conflictValue = row[conflictColumn];
      const existing = tables.users.find(
        (candidate) => candidate[conflictColumn] === conflictValue,
      );

      if (existing) {
        Object.assign(existing, row);
        result = { data: existing, error: null };
        return result;
      }

      if (typeof row['id'] !== 'string' || row['id'] === '') {
        row['id'] = nextId('user');
      }

      tables.users.push(row);
      result = { data: row, error: null };
      return result;
    };

    return {
      select(columns?: string) {
        return {
          async single() {
            const execution = execute();
            if (execution.error) {
              return {
                data: null,
                error: execution.error,
              };
            }

            return {
              data: execution.data ? selectColumns(execution.data, columns) : null,
              error: null,
            };
          },
        };
      },
      then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
        return Promise.resolve(execute()).then(resolve);
      },
    };
  };

  const client = {
    from(tableName: string) {
      const normalized = tableName as keyof TableRows;
      if (!tables[normalized]) {
        throw new Error(`Unsupported table in stub: ${tableName}`);
      }

      return {
        select(columns?: string) {
          return buildSelectQuery(normalized, columns);
        },
        insert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
          return buildInsertBuilder(normalized, values);
        },
        upsert(values: Record<string, unknown>, options?: { onConflict?: string }) {
          return buildUpsertBuilder(normalized, values, options);
        },
      };
    },
  } as unknown as Parameters<typeof setMessageStoreClient>[0];

  return {
    client,
    tables,
    seedKnowledgeChunk: async (input) => {
      const { error } = await client.from('knowledge_chunks').insert({
        content: input.content,
        metadata: input.metadata ?? {},
        embedding: input.embedding ?? [0.9, 0.1, 0.2],
      });

      if (error) {
        throw new Error(`Failed seeding knowledge chunk: ${String(error)}`);
      }
    },
  };
};

type TestHarness = {
  baseUrl: string;
  enqueuedJobs: IngressJobPayload[];
  close: () => Promise<void>;
};

const buildApiEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  ALLOW_INSECURE_HTTP: 'true',
  PORT: '0',
  WHATSAPP_VERIFY_TOKEN: 'verify-token-acceptance',
  WHATSAPP_APP_SECRET: 'secret-acceptance',
  WHATSAPP_PHONE_NUMBER_ID: 'phone-acceptance',
  WHATSAPP_ACCESS_TOKEN: 'token-acceptance',
  OPENAI_API_KEY: 'openai-key-acceptance',
  GEMINI_API_KEY: 'gemini-key-acceptance',
  REDIS_URL: 'redis://localhost:6379',
  SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
  OTEL_SERVICE_NAME: 'wa-chat-api-test',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
});

const signBody = (body: string, secret: string): string =>
  'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

const createIngressHarness = async (): Promise<TestHarness> => {
  const env = buildApiEnv();
  const enqueuedJobs: IngressJobPayload[] = [];
  const seenKeys = new Set<string>();

  const idempotencyStore: IdempotencyStore = {
    setIfNotExists: async (key: string) => {
      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    },
    delete: async (key: string) => {
      seenKeys.delete(key);
    },
  };

  const ingressQueue: IngressQueue = {
    enqueue: async (job: IngressJobPayload) => {
      enqueuedJobs.push(job);
    },
  };

  const observability: IngressObservability = {
    onIngressStart: (_context: IngressTraceContext) => {},
    onVerificationFailure: (_context: IngressTraceContext, _details: { reason: string }) => {},
    onMalformedPayload: (_context: IngressTraceContext, _details: { reason: string }) => {},
    onDuplicateHit: (_context: IngressTraceContext, _details: { eventKey: string }) => {},
    onEnqueueSuccess: (_context: IngressTraceContext, _details: { eventKey: string }) => {},
    onEnqueueFailure: (
      _context: IngressTraceContext,
      _details: { eventKey: string; errorCode: string },
    ) => {},
  };

  const app = createApp(env, { idempotencyStore, ingressQueue, observability });

  return new Promise<TestHarness>((resolve, reject) => {
    const server = app.listen(0, (listenError?: Error) => {
      if (listenError) {
        reject(listenError);
        return;
      }

      try {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Test server failed to bind to an ephemeral TCP port');
        }
        resolve({
          baseUrl: `http://localhost:${address.port}`,
          enqueuedJobs,
          close: async () =>
            new Promise<void>((serverResolve, serverReject) => {
              server.close((error) => {
                if (error) {
                  serverReject(error);
                  return;
                }
                serverResolve();
              });
            }),
        });
      } catch (error) {
        reject(error);
      }
    });
  });
};

const postSignedWebhook = async (input: {
  baseUrl: string;
  body: string;
  secret: string;
}): Promise<Response> => {
  return fetch(`${input.baseUrl}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signBody(input.body, input.secret),
    },
    body: input.body,
  });
};

const runQueuedJobs = async (
  jobs: IngressJobPayload[],
  processor: ReturnType<typeof createDefaultProcessor>,
): Promise<void> => {
  for (const job of jobs) {
    await runIngressJob({
      jobName: INGRESS_JOB_NAME,
      jobData: job,
      policies: {
        concurrency: 1,
        jobTimeoutMs: 5000,
        retry: { transientMaxAttempts: 3, permanentMaxAttempts: 1 },
      },
      processor,
    });
  }
};

const buildAgentMetadata = (overrides: Partial<AgentRunnerResult['metadata']> = {}) => ({
  agentRoute: null,
  provider: null,
  intent: null,
  confidence: null,
  toolName: null,
  toolInput: null,
  toolOutput: null,
  toolDurationMs: null,
  toolSuccess: null,
  ...overrides,
});

const createProcessorWithAgentRunner = (
  env: {
    WHATSAPP_PHONE_NUMBER_ID: string;
    WHATSAPP_ACCESS_TOKEN: string;
  },
  fetchImpl: Parameters<typeof createDefaultProcessor>[1],
  agentRunner: (input: {
    message: string;
    conversationId: string;
    sender: string;
  }) => Promise<AgentRunnerResult>,
) => {
  const factory = createDefaultProcessor as unknown as (
    env: {
      WHATSAPP_PHONE_NUMBER_ID: string;
      WHATSAPP_ACCESS_TOKEN: string;
    },
    fetchImpl: Parameters<typeof createDefaultProcessor>[1],
    dependencies: {
      agentRunner: (input: {
        message: string;
        conversationId: string;
        sender: string;
      }) => Promise<AgentRunnerResult>;
    },
  ) => ReturnType<typeof createDefaultProcessor>;

  return factory(env, fetchImpl, { agentRunner });
};

type EmbeddingStub = {
  embedQuery: (text: string) => Promise<number[]>;
};

const createEmbeddingStub = (): EmbeddingStub => ({
  embedQuery: async (text: string) => {
    const lowered = text.toLowerCase();
    return [
      lowered.includes('return') || lowered.includes('pengembalian') ? 0.99 : 0.25,
      lowered.includes('kebijakan') ? 0.95 : 0.1,
      lowered.length / 100,
    ];
  },
});

const vectorSearchStub = (
  queryEmbedding: number[],
  message: string,
  chunks: Array<Record<string, unknown>>,
): { content: string; confidence: number } | null => {
  const lowered = message.toLowerCase();
  const seededChunk = chunks.find((chunk) => typeof chunk['content'] === 'string');
  if (!seededChunk || typeof seededChunk['content'] !== 'string') {
    return null;
  }

  const hasReturnIntent =
    lowered.includes('return') ||
    lowered.includes('pengembalian') ||
    lowered.includes('kebijakan return');
  const confidence = hasReturnIntent ? Math.max(queryEmbedding[0] ?? 0, 0.91) : 0.2;

  if (confidence < 0.7) {
    return null;
  }

  return {
    content: seededChunk['content'],
    confidence,
  };
};

let failed = 0;

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ${color.green}✓${color.reset} ${name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `  ${color.red}✗${color.reset} ${name}\n    ${color.dim}${message}${color.reset}`,
    );
  }
}

console.log(`${color.cyan}Acceptance: Webhook -> Worker Behavior Gates (Phase 5)${color.reset}\n`);

const main = async () => {
  await runTest('Test A: happy path uses seeded RAG context and writes side effects', async () => {
    const supabase = createInMemorySupabaseClient();
    setMessageStoreClient(supabase.client);
    await supabase.seedKnowledgeChunk({
      content:
        'Kebijakan return: barang dapat dikembalikan dalam 7 hari jika masih tersegel dan menyertakan bukti pembelian.',
      metadata: { topic: 'return_policy' },
    });

    const embeddingStub = createEmbeddingStub();
    const agentInvocations: Array<{ message: string; conversationId: string; sender: string }> = [];
    const agentRunner = async (input: {
      message: string;
      conversationId: string;
      sender: string;
    }): Promise<AgentRunnerResult> => {
      agentInvocations.push(input);
      const queryEmbedding = await embeddingStub.embedQuery(input.message);
      const ragResult = vectorSearchStub(
        queryEmbedding,
        input.message,
        supabase.tables.knowledge_chunks,
      );

      if (!ragResult) {
        return {
          text: 'Mohon jelaskan pertanyaan Anda lebih spesifik.',
          route: 'llm',
          metadata: buildAgentMetadata({
            agentRoute: 'clarification_path',
            provider: 'openai',
            intent: 'CLARIFICATION',
            confidence: 0.45,
          }),
        };
      }

      return {
        text: `Menurut kebijakan kami: ${ragResult.content}`,
        route: 'llm',
        metadata: buildAgentMetadata({
          agentRoute: 'rag_path',
          provider: 'openai',
          intent: 'RAG',
          confidence: ragResult.confidence,
        }),
      };
    };

    const outboundCalls: Array<{ url: string; body: string }> = [];
    const processor = createProcessorWithAgentRunner(
      {
        WHATSAPP_PHONE_NUMBER_ID: 'phone-acceptance',
        WHATSAPP_ACCESS_TOKEN: 'token-acceptance',
      },
      async (input, init) => {
        outboundCalls.push({ url: input, body: init.body });
        return {
          ok: true,
          status: 200,
          text: async () => '{"messages":[{"id":"wamid.acceptance.outbound.001"}]}',
        };
      },
      agentRunner,
    );

    const harness = await createIngressHarness();
    try {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.acceptance.a.001',
                      timestamp: '1700000300',
                      text: { body: 'apa kebijakan return barang?' },
                      type: 'text',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const response = await postSignedWebhook({
        baseUrl: harness.baseUrl,
        body: payload,
        secret: 'secret-acceptance',
      });

      assert.equal(response.status, 200);
      assert.equal(harness.enqueuedJobs.length, 1, 'Webhook should enqueue one ingress job');

      await runQueuedJobs(harness.enqueuedJobs, processor);
    } finally {
      await harness.close();
    }

    assert.equal(agentInvocations.length, 1, 'LLM pipeline runner should be invoked once');
    assert.equal(outboundCalls.length, 1, 'Exactly one outbound WhatsApp send is expected');
    assert.match(
      outboundCalls[0]?.body ?? '',
      /Kebijakan return|pengembalian dalam 7 hari/i,
      'Outbound response must contain grounded return-policy content',
    );

    assert.equal(supabase.tables.users.length, 1, 'users row must be created');
    assert.equal(supabase.tables.conversations.length, 1, 'conversation row must be created');
    const inboundMessages = supabase.tables.messages.filter(
      (row) => row['direction'] === 'inbound',
    );
    const outboundMessages = supabase.tables.messages.filter(
      (row) => row['direction'] === 'outbound',
    );
    assert.equal(inboundMessages.length, 1, 'one inbound message row expected');
    assert.equal(outboundMessages.length, 1, 'one outbound message row expected');
    const successEvents = supabase.tables.agent_events.filter(
      (row) => row['event_type'] === 'pipeline_success',
    );
    assert.equal(successEvents.length, 1, 'pipeline_success event must be written');
    const payload = successEvents[0]?.['payload'] as Record<string, unknown> | undefined;
    assert.equal(payload?.['route'], 'rag_path');
  });

  await runTest(
    'Test B: duplicate webhook is idempotent with exactly one side effect set',
    async () => {
      const supabase = createInMemorySupabaseClient();
      setMessageStoreClient(supabase.client);

      const agentRunner = async (): Promise<AgentRunnerResult> => ({
        text: 'Ini jawaban ter-grounded dari agent.',
        route: 'llm',
        metadata: buildAgentMetadata({
          agentRoute: 'rag_path',
          provider: 'openai',
          intent: 'RAG',
          confidence: 0.9,
        }),
      });

      let outboundSends = 0;
      const processor = createProcessorWithAgentRunner(
        {
          WHATSAPP_PHONE_NUMBER_ID: 'phone-acceptance',
          WHATSAPP_ACCESS_TOKEN: 'token-acceptance',
        },
        async () => {
          outboundSends += 1;
          return {
            ok: true,
            status: 200,
            text: async () => '{"messages":[{"id":"wamid.acceptance.outbound.002"}]}',
          };
        },
        agentRunner,
      );

      const harness = await createIngressHarness();
      try {
        const payload = JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      {
                        from: '628123456789',
                        id: 'wamid.acceptance.b.dup001',
                        timestamp: '1700000400',
                        text: { body: 'cek kebijakan return' },
                        type: 'text',
                      },
                    ],
                  },
                  field: 'messages',
                },
              ],
            },
          ],
        });

        const first = await postSignedWebhook({
          baseUrl: harness.baseUrl,
          body: payload,
          secret: 'secret-acceptance',
        });
        const second = await postSignedWebhook({
          baseUrl: harness.baseUrl,
          body: payload,
          secret: 'secret-acceptance',
        });

        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.equal(
          harness.enqueuedJobs.length,
          1,
          'Duplicate webhook must not enqueue a second job',
        );

        await runQueuedJobs(harness.enqueuedJobs, processor);
      } finally {
        await harness.close();
      }

      assert.equal(
        supabase.tables.messages.filter(
          (row) => row['whatsapp_message_id'] === 'wamid.acceptance.b.dup001',
        ).length,
        1,
        'Only one inbound DB row should exist for duplicate wamid',
      );
      assert.equal(outboundSends, 1, 'Outbound send should happen exactly once');
      assert.equal(
        supabase.tables.users.filter((row) => row['phone_number'] === '+628123456789').length,
        1,
        'users table must contain exactly one row for sender',
      );
      const userId = supabase.tables.users[0]?.['id'];
      assert.equal(
        supabase.tables.conversations.filter((row) => row['user_id'] === userId).length,
        1,
        'conversations table must contain exactly one open conversation for sender',
      );
    },
  );

  await runTest(
    'Test C: provider fallback still yields pipeline_success and outbound response',
    async () => {
      const supabase = createInMemorySupabaseClient();
      setMessageStoreClient(supabase.client);

      const providerAttempts: string[] = [];
      const agentRunner = async (): Promise<AgentRunnerResult> => {
        // Simulates RunnableWithFallbacks semantics: try primary, then fallback.
        providerAttempts.push('openai');
        try {
          throw new Error('Primary provider simulated failure');
        } catch {
          providerAttempts.push('gemini');
          return {
            text: 'Jawaban fallback Gemini yang tetap aman dan ter-grounded.',
            route: 'llm',
            metadata: buildAgentMetadata({
              agentRoute: 'rag_path',
              provider: 'gemini',
              intent: 'RAG',
              confidence: 0.88,
            }),
          };
        }
      };

      let outboundSends = 0;
      const processor = createProcessorWithAgentRunner(
        {
          WHATSAPP_PHONE_NUMBER_ID: 'phone-acceptance',
          WHATSAPP_ACCESS_TOKEN: 'token-acceptance',
        },
        async () => {
          outboundSends += 1;
          return {
            ok: true,
            status: 200,
            text: async () => '{"messages":[{"id":"wamid.acceptance.outbound.003"}]}',
          };
        },
        agentRunner,
      );

      const harness = await createIngressHarness();
      try {
        const payload = JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      {
                        from: '628123456780',
                        id: 'wamid.acceptance.c.001',
                        timestamp: '1700000500',
                        text: { body: 'tolong bantu cek status saya' },
                        type: 'text',
                      },
                    ],
                  },
                  field: 'messages',
                },
              ],
            },
          ],
        });

        const response = await postSignedWebhook({
          baseUrl: harness.baseUrl,
          body: payload,
          secret: 'secret-acceptance',
        });
        assert.equal(response.status, 200);
        assert.equal(harness.enqueuedJobs.length, 1);
        await runQueuedJobs(harness.enqueuedJobs, processor);
      } finally {
        await harness.close();
      }

      assert.deepEqual(
        providerAttempts,
        ['openai', 'gemini'],
        'Fallback sequence should try primary provider before fallback provider',
      );
      assert.equal(outboundSends, 1, 'Reply should still be sent after fallback success');
      const successEvents = supabase.tables.agent_events.filter(
        (row) => row['event_type'] === 'pipeline_success',
      );
      const failureEvents = supabase.tables.agent_events.filter(
        (row) => row['event_type'] === 'pipeline_failure',
      );
      assert.equal(successEvents.length, 1, 'Fallback success must persist pipeline_success');
      assert.equal(failureEvents.length, 0, 'Fallback success should not persist pipeline_failure');
      const payload = successEvents[0]?.['payload'] as Record<string, unknown> | undefined;
      assert.equal(payload?.['provider'], 'gemini');
    },
  );

  if (failed > 0) {
    console.error(`\n${color.red}${failed} acceptance test(s) failed.${color.reset}`);
    process.exit(1);
  }

  console.log(`\n${color.green}All Phase 5 acceptance tests passed.${color.reset}`);
};

void main();
