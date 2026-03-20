import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RunnableLambda } from '@langchain/core/runnables';

const { mockRouterInvoke } = vi.hoisted(() => ({
  mockRouterInvoke: vi.fn(),
}));

vi.mock('../../../router/model-router.js', () => {
  return {
    createStructuredModelRouter: vi.fn(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      RunnableLambda.from(async (input: any) => await mockRouterInvoke(input)),
    ),
  };
});

import { compositionChain } from '../composition.js';
import type { AgentState } from '../../types.js';

describe('compositionChain - Structured Output & Fallbacks', () => {
  beforeEach(() => {
    mockRouterInvoke.mockReset();
  });

  it('should return valid structured output when the model succeeds', async () => {
    // Simulate primary model successfully parsing output
    mockRouterInvoke.mockResolvedValueOnce({
      content: 'Here is your order status.',
      confidence: 0.95,
      escalate_flag: false,
    });

    const initialState: AgentState = {
      originalInput: 'Where is my order?',
      normalizedInput: 'where is my order?',
      route: 'tool_path',
      intent: 'TOOL',
    };

    const result = await compositionChain.invoke(initialState);

    expect(mockRouterInvoke).toHaveBeenCalledTimes(1);
    expect(result.composedResponse).toBe('Here is your order status.');
    expect(result.confidence).toBe(0.95);
    expect(result.intent).toBe('TOOL');
  });

  it('should skip model invocation when composedResponse is already set', async () => {
    // Should skip only if route is NOT 'tool_path'
    const initialState: AgentState = {
      originalInput: 'halo',
      normalizedInput: 'halo',
      route: 'clarification_path',
      intent: 'GREETING',
      composedResponse: 'Greeting response already prepared',
    };

    const result = await compositionChain.invoke(initialState);

    expect(mockRouterInvoke).not.toHaveBeenCalled();
    expect(result.composedResponse).toBe('Greeting response already prepared');
  });

  it('should escalate when escalate_flag is true', async () => {
    mockRouterInvoke.mockResolvedValueOnce({
      content: 'I need to transfer you to an agent.',
      confidence: 0.99,
      escalate_flag: true, // Should trigger intent switch
    });

    const initialState: AgentState = {
      originalInput: 'Talk to human',
      normalizedInput: 'talk to human',
      route: 'clarification_path',
      intent: 'CLARIFICATION',
    };

    const result = await compositionChain.invoke(initialState);

    expect(mockRouterInvoke).toHaveBeenCalledTimes(1);
    expect(result.intent).toBe('ESCALATION');
    expect(result.composedResponse).toBe('I need to transfer you to an agent.');
  });

  it('should retry with fallback provider when primary provider is rate-limited', async () => {
    mockRouterInvoke
      .mockRejectedValueOnce(new Error('OpenAI 429 rate limit exceeded'))
      .mockResolvedValueOnce({
        content: 'Fallback provider answer',
        confidence: 0.88,
        escalate_flag: false,
      });

    const initialState: AgentState = {
      originalInput: 'apa kebijakan return?',
      normalizedInput: 'apa kebijakan return?',
      route: 'rag_path',
      intent: 'RAG',
      retrievedContext: 'Return policy context',
      citations: [],
    };

    const result = await compositionChain.invoke(initialState);

    expect(mockRouterInvoke).toHaveBeenCalledTimes(2);
    expect(result.composedResponse).toBe('Fallback provider answer');
    expect(result.intent).toBe('RAG');
  });

  it('should use the ultimate safe fallback when both providers fail', async () => {
    mockRouterInvoke
      .mockRejectedValueOnce(new Error('OpenAI 429 rate limit exceeded'))
      .mockRejectedValueOnce(new Error('Gemini unavailable'));

    const initialState: AgentState = {
      originalInput: 'trigger failure',
      normalizedInput: 'trigger failure',
      route: 'rag_path',
      intent: 'RAG',
      retrievedContext: 'Mock context',
      citations: [],
    };

    const result = await compositionChain.invoke(initialState);

    expect(mockRouterInvoke).toHaveBeenCalledTimes(2);

    // Ultimate Safe Fallback assertions
    expect(result.composedResponse).toBe('System have some trouble.');
    expect(result.confidence).toBe(0);
    expect(result.intent).toBe('ESCALATION'); // since escalate_flag is true in fallback
  });
});
