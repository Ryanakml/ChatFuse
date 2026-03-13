import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentState } from '../../types.js';

const { classifyIntentWithGroqMock } = vi.hoisted(() => ({
  classifyIntentWithGroqMock: vi.fn(),
}));

vi.mock('../groq-classifier.js', () => ({
  classifyIntentWithGroq: classifyIntentWithGroqMock,
}));

import { classificationChain } from '../classification.js';

describe('classificationChain (LLM integration points)', () => {
  beforeEach(() => {
    classifyIntentWithGroqMock.mockReset();
  });

  it('uses LLM intent and confidence when Groq classification succeeds', async () => {
    classifyIntentWithGroqMock.mockResolvedValueOnce({ intent: 'ESCALATION', confidence: 0.88 });

    const state: AgentState = {
      originalInput: 'I need a manager now',
      normalizedInput: 'I need a manager now',
    };

    const result = (await classificationChain.invoke(state)) as AgentState;

    expect(result.intent).toBe('ESCALATION');
    expect(result.confidence).toBe(0.88);
  });

  it('keeps existing state confidence when provided', async () => {
    classifyIntentWithGroqMock.mockResolvedValueOnce({ intent: 'RAG', confidence: 0.91 });

    const state: AgentState = {
      originalInput: 'how does this work?',
      normalizedInput: 'how does this work?',
      confidence: 0.42,
    };

    const result = (await classificationChain.invoke(state)) as AgentState;

    expect(result.intent).toBe('RAG');
    expect(result.confidence).toBe(0.42);
  });

  it('falls back to keyword classification when Groq throws', async () => {
    classifyIntentWithGroqMock.mockRejectedValueOnce(new Error('timeout'));

    const state: AgentState = {
      originalInput: 'track my order 12345',
      normalizedInput: 'track my order 12345',
    };

    const result = (await classificationChain.invoke(state)) as AgentState;

    expect(result.intent).toBe('TOOL');
    expect(result.confidence).toBe(0.5);
  });

  it('returns clarification for empty input without calling Groq', async () => {
    const state: AgentState = {
      originalInput: '',
      normalizedInput: '   ',
    };

    const result = (await classificationChain.invoke(state)) as AgentState;

    expect(result.intent).toBe('CLARIFICATION');
    expect(result.confidence).toBe(0.5);
    expect(classifyIntentWithGroqMock).not.toHaveBeenCalled();
  });
});
