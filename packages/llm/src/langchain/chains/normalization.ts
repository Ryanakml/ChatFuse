import { RunnableLambda } from '@langchain/core/runnables';
import type { AgentState } from '../types.js';

/**
 * Step 1: Input normalization chain.
 * Standardizes incoming payload into a plain string and initiates state.
 */
export const normalizationChain = RunnableLambda.from((input: AgentState) => {
  let normalized = '';

  if (typeof input.originalInput === 'string') {
    normalized = input.originalInput.trim();
  } else if (input.originalInput && typeof input.originalInput === 'object') {
    // Basic extraction if it's a generic payload
    const text = input.originalInput.text || input.originalInput.message || '';
    normalized = String(text).trim();
  }

  return {
    ...input,
    normalizedInput: normalized,
  };
});
