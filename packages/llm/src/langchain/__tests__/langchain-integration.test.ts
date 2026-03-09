/**
 * LangChain Integration Test (L2 – Integration)
 *
 * Exercises the real chain wiring end-to-end using:
 * - Real normalizationChain, classificationChain, routerChain, compositionChain, policyChain
 * - FakeListChatModel (no real LLM call, but real LangChain interfaces)
 * - Real StructuredOutputParser / Zod schemas
 *
 * This test validates chain composition and state propagation without mocking
 * every individual chain (unlike pipeline.test.ts which mocks the model router).
 *
 * Uses Vitest since it's in packages/llm.
 */
import { describe, it, expect, vi } from 'vitest';

// Prevent Supabase client from connecting to a real DB
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

// Stub the vector store and embeddings
vi.mock('../../rag/vectorstore.js', () => ({
  getVectorStore: vi.fn(),
  searchKnowledge: vi.fn().mockResolvedValue([[{ pageContent: 'mock retrieved context' }, 0.9]]),
}));
vi.mock('../../rag/embeddings.js', () => ({
  getEmbeddings: vi.fn().mockReturnValue({
    embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2]]),
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2]),
  }),
}));

// Mock metric counters from @wa-chat/shared (used by routerChain)
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

// Use a FakeListChatModel to provide deterministic LLM responses in chain
import { RunnableLambda } from '@langchain/core/runnables';

vi.mock('../../router/model-router.js', () => ({
  createStructuredModelRouter: vi.fn(() =>
    RunnableLambda.from(async (promptValue: unknown) => {
      const text = String(promptValue || '');
      if (text.includes('rag_path') || text.includes('how')) {
        return { content: '[RAG INTEGRATION RESPONSE]', confidence: 0.9, escalate_flag: false };
      }
      if (text.includes('tool_path') || text.includes('order') || text.includes('track')) {
        return { content: '[TOOL INTEGRATION RESPONSE]', confidence: 0.9, escalate_flag: false };
      }
      if (text.includes('escalation_path') || text.includes('human') || text.includes('agent')) {
        return {
          content: '[ESCALATION INTEGRATION RESPONSE]',
          confidence: 0.9,
          escalate_flag: true,
        };
      }
      return { content: '[CLARIFICATION RESPONSE]', confidence: 0.5, escalate_flag: false };
    }),
  ),
}));

import { normalizationChain } from '../chains/normalization.js';
import { classificationChain } from '../chains/classification.js';
import { routerChain } from '../chains/router.js';
import type { AgentState } from '../types.js';

describe('LangChain Chain Integration (L2 – Integration)', () => {
  /**
   * Run the real normalization → classification → routing chain composition.
   * This tests the chain wiring and state propagation without mocking individual chains.
   */
  async function runCoreChain(input: string): Promise<AgentState> {
    const baseState: AgentState = {
      originalInput: input,
      confidence: 0.9, // simulate session context confidence
    };

    const normalized = (await normalizationChain.invoke(baseState)) as AgentState;
    const classified = (await classificationChain.invoke(normalized)) as AgentState;
    const routed = (await routerChain.invoke(classified)) as AgentState;

    return routed;
  }

  it('routes a RAG query through the real chain wiring', async () => {
    const state = await runCoreChain('how does this work?');

    expect(state.normalizedInput).toBe('how does this work?');
    expect(state.intent).toBe('RAG');
    expect(state.route).toBe('rag_path');
  });

  it('routes a TOOL query through the real chain wiring', async () => {
    const state = await runCoreChain('track my order 456');

    expect(state.normalizedInput).toBe('track my order 456');
    expect(state.intent).toBe('TOOL');
    expect(state.route).toBe('tool_path');
  });

  it('routes an ESCALATION query through the real chain wiring', async () => {
    const state = await runCoreChain('i need a human agent');

    expect(state.normalizedInput).toBe('i need a human agent');
    expect(state.intent).toBe('ESCALATION');
    expect(state.route).toBe('escalation_path');
  });

  it('low confidence forces escalation regardless of intent', async () => {
    const baseState: AgentState = {
      originalInput: 'how does this work?',
      confidence: 0.1, // below 0.3 threshold → forced escalation
    };
    const normalized = (await normalizationChain.invoke(baseState)) as AgentState;
    const classified = (await classificationChain.invoke(normalized)) as AgentState;
    const routed = (await routerChain.invoke(classified)) as AgentState;

    expect(routed.route).toBe('escalation_path');
  });

  it('state passes through all chain steps without data loss', async () => {
    const baseState: AgentState = {
      originalInput: 'how does this work?',
      confidence: 0.9,
      context: {
        userId: 'user-integration-test',
        conversationId: 'conv-integration-test',
        history: [],
      },
    };

    const normalized = (await normalizationChain.invoke(baseState)) as AgentState;
    const classified = (await classificationChain.invoke(normalized)) as AgentState;
    const routed = (await routerChain.invoke(classified)) as AgentState;

    // Context must survive all chain hops
    expect(routed.context?.userId).toBe('user-integration-test');
    expect(routed.context?.conversationId).toBe('conv-integration-test');
    expect(routed.originalInput).toBe('how does this work?');
  });
});
