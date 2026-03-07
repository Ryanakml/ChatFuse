import { describe, it, expect } from 'vitest';
import { processMessage } from '../pipeline.js';

describe('LangChain Orchestration Pipeline (G2)', () => {
  it('should process a normal RAG query correctly', async () => {
    const state = await processMessage({
      payload: 'how does this work?',
      userId: 'user-1',
      conversationId: 'convo-1',
    });

    expect(state.normalizedInput).toBe('how does this work?');
    expect(state.intent).toBe('RAG');
    expect(state.route).toBe('rag_path');
    expect(state.composedResponse).toContain('[RAG RESPONSE]');
    expect(state.isSafe).toBe(true);
  });

  it('should process a tool query correctly', async () => {
    const state = await processMessage({
      payload: 'track my order 123',
      userId: 'user-2',
      conversationId: 'convo-2',
    });

    expect(state.normalizedInput).toBe('track my order 123');
    expect(state.intent).toBe('TOOL');
    expect(state.route).toBe('tool_path');
    expect(state.composedResponse).toContain('[TOOL RESPONSE]');
    expect(state.isSafe).toBe(true);
  });

  it('should escalate to a human agent', async () => {
    const state = await processMessage({
      payload: 'talk to a human agent',
      userId: 'user-3',
      conversationId: 'convo-3',
    });

    expect(state.normalizedInput).toBe('talk to a human agent');
    expect(state.intent).toBe('ESCALATION');
    expect(state.route).toBe('escalation_path');
    expect(state.composedResponse).toContain('[ESCALATION RESPONSE]');
    expect(state.isSafe).toBe(true);
  });

  it('should block inappropriate content via policy', async () => {
    const state = await processMessage({
      payload: 'this is inappropriate', // To simulate unsafe
      userId: 'user-4',
      conversationId: 'convo-4',
    });

    // In our mock logic, if composedResponse has 'inappropriate', it's unsafe.
    // Our mock intent classification routes this to CLARIFICATION:
    expect(state.intent).toBe('CLARIFICATION');
    expect(state.route).toBe('clarification_path');

    // The default clarification response includes the normalized input which has 'inappropriate'.
    expect(state.composedResponse).toContain('inappropriate');
    expect(state.isSafe).toBe(false);
    expect(state.finalResponse).toBe('I cannot fulfill this request due to policy restrictions.');
  });
});
