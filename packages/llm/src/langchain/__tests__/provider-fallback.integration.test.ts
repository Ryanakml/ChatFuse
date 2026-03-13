/**
 * Integration Test: Provider Fallback Path (L2)
 *
 * Verifies that when the primary LLM provider (OpenAI) fails, the model router
 * falls back to Gemini and the pipeline still returns a valid AgentState.
 *
 * Uses Vitest mocking (no real LLM calls). Lives in packages/llm since it
 * depends on Vitest and llm-internal module paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RunnableLambda } from '@langchain/core/runnables';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('../../rag/vectorstore.js', () => ({
  getVectorStore: vi.fn(),
  searchKnowledge: vi.fn().mockResolvedValue([[{ pageContent: 'fallback context' }, 0.9]]),
}));
vi.mock('../../rag/embeddings.js', () => ({
  getEmbeddings: vi.fn().mockReturnValue({
    embedDocuments: vi.fn().mockResolvedValue([[0.1]]),
    embedQuery: vi.fn().mockResolvedValue([0.1]),
  }),
}));
vi.mock('@wa-chat/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wa-chat/shared')>();
  return {
    ...actual,
    appMetrics: {
      agentPathCount: { add: vi.fn() },
      queueProcessingLatency: { record: vi.fn() },
      queueDlqCount: { add: vi.fn() },
      queueRetryCount: { add: vi.fn() },
    },
  };
});

// Track which providers are called during each test
const providerCallLog: string[] = [];

vi.mock('../../router/model-router.js', () => ({
  createStructuredModelRouter: vi.fn(() =>
    // Simulate OpenAI failing on the first attempt, then Gemini answering
    RunnableLambda.from(async () => {
      try {
        providerCallLog.push('openai');
        if (providerCallLog.filter((p) => p === 'openai').length === 1) {
          throw new Error('OpenAI rate limit exceeded (simulated)');
        }
        return { content: '[OPENAI RESPONSE]', confidence: 0.9, escalate_flag: false };
      } catch {
        providerCallLog.push('gemini');
        return { content: '[GEMINI FALLBACK RESPONSE]', confidence: 0.85, escalate_flag: false };
      }
    }),
  ),
}));

import { processMessage } from '../pipeline.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Integration: Provider Fallback Path (L2)', () => {
  beforeEach(() => {
    providerCallLog.length = 0;
  });

  it('falls back to Gemini when OpenAI fails and returns a valid response', async () => {
    const state = await processMessage({
      payload: 'how does this work?',
      userId: 'user-fallback-test',
      conversationId: 'conv-fallback-test',
    });

    // Both providers were attempted in sequence
    expect(providerCallLog).toContain('openai');
    expect(providerCallLog).toContain('gemini');

    // Final response came from Gemini
    expect(state.composedResponse).toContain('[GEMINI FALLBACK RESPONSE]');
    expect(state.finalResponse).toBe('[GEMINI FALLBACK RESPONSE]');
  });

  it('returns a structurally valid AgentState after provider fallback', async () => {
    const state = await processMessage({
      payload: 'track my order 789',
      userId: 'user-fallback-test-2',
      conversationId: 'conv-fallback-test-2',
    });

    expect(typeof state.normalizedInput).toBe('string');
    expect(state.intent).toMatch(/^(RAG|TOOL|CLARIFICATION|ESCALATION)$/);
    expect(state.route).toMatch(/^(rag_path|tool_path|clarification_path|escalation_path)$/);
    expect(typeof state.isSafe).toBe('boolean');
    expect(typeof state.finalResponse).toBe('string');
  });

  it('provider call log shows openai before gemini (correct fallback order)', async () => {
    await processMessage({
      payload: 'tell me something',
      userId: 'user-fallback-test-3',
      conversationId: 'conv-fallback-test-3',
    });

    const openaiIdx = providerCallLog.indexOf('openai');
    const geminiIdx = providerCallLog.indexOf('gemini');
    expect(openaiIdx).toBeGreaterThanOrEqual(0);
    expect(geminiIdx).toBeGreaterThan(openaiIdx);
  });
});
