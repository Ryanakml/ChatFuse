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

  it('should use the ultimate safe fallback when the model or parsing fails entirely', async () => {
    // Simulate model throwing an error (e.g. both primary and fallback failed to parse)
    mockRouterInvoke.mockRejectedValueOnce(new Error('OutputParserException: Could not parse'));

    const initialState: AgentState = {
      originalInput: 'trigger failure',
      normalizedInput: 'trigger failure',
      route: 'rag_path',
      intent: 'RAG',
    };

    const result = await compositionChain.invoke(initialState);

    expect(mockRouterInvoke).toHaveBeenCalledTimes(1);

    // Ultimate Safe Fallback assertions
    expect(result.composedResponse).toBe('System have some trouble.');
    expect(result.confidence).toBe(0);
    expect(result.intent).toBe('ESCALATION'); // since escalate_flag is true in fallback
  });
});
