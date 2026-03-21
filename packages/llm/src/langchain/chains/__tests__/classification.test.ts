import { describe, it, expect } from 'vitest';
import { classificationChain } from '../classification.js';
import type { AgentState } from '../../types.js';

describe('classificationChain (L2 – Unit)', () => {
  async function classify(normalizedInput: string): Promise<AgentState['intent']> {
    const state: AgentState = { originalInput: normalizedInput, normalizedInput };
    const result = (await classificationChain.invoke(state)) as AgentState;
    return result.intent;
  }

  // TOOL intent – triggered by order/status/track keywords
  it.each([
    ['check my order 123', 'TOOL'],
    ['what is the order status?', 'TOOL'],
    ['track my package', 'TOOL'],
  ])('classifies "%s" as TOOL', async (input, expected) => {
    expect(await classify(input)).toBe(expected);
  });

  // RAG intent – triggered by help/how/what keywords (when no TOOL keyword present)
  it.each([
    ['how does this work?', 'RAG'],
    ['what is your return policy?', 'RAG'],
    ['help me understand the process', 'RAG'],
  ])('classifies "%s" as RAG', async (input, expected) => {
    expect(await classify(input)).toBe(expected);
  });

  // ESCALATION intent – triggered by manager/human/agent keywords
  it.each([
    ['i want to talk to a human', 'ESCALATION'],
    ['connect me to an agent', 'ESCALATION'],
    ['speak to the manager', 'ESCALATION'],
  ])('classifies "%s" as ESCALATION', async (input, expected) => {
    expect(await classify(input)).toBe(expected);
  });

  // CLARIFICATION intent – fallback for unrecognised input
  it.each([
    ['random gibberish xyz', 'CLARIFICATION'],
    ['', 'CLARIFICATION'],
    ['hello', 'GREETING'],
  ])('classifies "%s" using fallback rules', async (input, expected) => {
    expect(await classify(input)).toBe(expected);
  });

  it('is case-insensitive (uses lowercased input from state)', async () => {
    // The classification chain lowercases the normalizedInput internally.
    // Passing an already-lowercase string verifies correct handling.
    expect(await classify('ORDER STATUS PLEASE')).toBe('TOOL');
  });

  it('preserves all other state fields', async () => {
    const state: AgentState = {
      originalInput: 'help',
      normalizedInput: 'help',
      confidence: 0.8,
    };
    const result = (await classificationChain.invoke(state)) as AgentState;
    expect(result.confidence).toBe(0.8);
    expect(result.originalInput).toBe('help');
  });
});
