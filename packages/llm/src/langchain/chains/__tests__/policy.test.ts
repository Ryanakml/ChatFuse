import { describe, it, expect } from 'vitest';
import { policyChain } from '../policy.js';
import type { AgentState } from '../../types.js';

describe('policyChain', () => {
  it('should return the original response if safe and no RAG policy is violated', async () => {
    const initialState: AgentState = {
      originalInput: 'hello',
      composedResponse: 'Hello there!',
      intent: 'UNKNOWN',
    };

    const result = await policyChain.invoke(initialState);
    expect(result.isSafe).toBe(true);
    expect(result.finalResponse).toBe('Hello there!');
    expect(result.intent).toBe('UNKNOWN');
  });

  it('should reject inappropriate content', async () => {
    const initialState: AgentState = {
      originalInput: 'bad input',
      composedResponse: 'This is an INAPPROPRIATE response.',
      intent: 'UNKNOWN',
    };

    const result = await policyChain.invoke(initialState);
    expect(result.isSafe).toBe(false);
    expect(result.finalResponse).toBe('I cannot fulfill this request due to policy restrictions.');
  });

  it('should enforce grounded response ("I need clarification") if RAG intent has low confidence', async () => {
    const initialState: AgentState = {
      originalInput: 'what is X?',
      composedResponse: 'X is Y.',
      intent: 'RAG',
      retrievalConfidence: 0.5, // Below 0.70 threshold
    };

    const result = await policyChain.invoke(initialState);
    expect(result.finalResponse).toBe('I need clarification');
    expect(result.intent).toBe('CLARIFICATION');
  });

  it('should not override response if RAG intent has high confidence', async () => {
    const initialState: AgentState = {
      originalInput: 'what is X?',
      composedResponse: 'X is definitively Y based on context.',
      intent: 'RAG',
      retrievalConfidence: 0.85, // Above threshold
    };

    const result = await policyChain.invoke(initialState);
    expect(result.finalResponse).toBe('X is definitively Y based on context.');
    expect(result.intent).toBe('RAG');
  });
});
