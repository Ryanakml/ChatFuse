import { RunnableLambda } from '@langchain/core/runnables';
import type { AgentState } from '../types.js';

/**
 * Step 4: Confidence evaluation step.
 * Returns a confidence score for the classified intent.
 */
export const confidenceChain = RunnableLambda.from(async (state: AgentState) => {
  let confidence = 0.5; // default moderate confidence

  // Example simple confidence scoring logic
  if (state.intent === 'TOOL' || state.intent === 'RAG') {
    confidence = 0.9;
  } else if (state.intent === 'ESCALATION') {
    confidence = 0.95;
  } else if (state.intent === 'CLARIFICATION') {
    confidence = 0.4;
  }

  return {
    ...state,
    confidence,
  };
});
