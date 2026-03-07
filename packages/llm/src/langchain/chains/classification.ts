import { RunnableLambda } from '@langchain/core/runnables';
import type { AgentState } from '../types.js';

/**
 * Step 3: Intent classification chain.
 * Determines what the user wants based on normalized input.
 */
export const classificationChain = RunnableLambda.from(async (state: AgentState) => {
  const input = state.normalizedInput?.toLowerCase() || '';

  let intent: AgentState['intent'] = 'UNKNOWN';

  // Basic keyword-based intent for now.
  // In a real implementation, would use an LLM or specific classifier.
  if (input.includes('order') || input.includes('status') || input.includes('track')) {
    intent = 'TOOL';
  } else if (input.includes('help') || input.includes('how') || input.includes('what')) {
    intent = 'RAG';
  } else if (input.includes('manager') || input.includes('human') || input.includes('agent')) {
    intent = 'ESCALATION';
  } else {
    intent = 'CLARIFICATION';
  }

  return {
    ...state,
    intent,
  };
});
