import { RunnableLambda } from '@langchain/core/runnables';
import type { AgentState } from '../types.js';

/**
 * Step 4: Confidence evaluation step.
 * Returns a confidence score for the classified intent.
 */
export const confidenceChain = RunnableLambda.from(async (state: AgentState) => {
  let confidence = 0.5; // default moderate confidence

  // Example simple confidence scoring logic
  if (state.intent === 'TOOL') {
    confidence = 0.9;
  } else if (state.intent === 'RAG') {
    // Reject low-confidence retrieval and trigger fallback
    if (state.retrievalConfidence !== undefined && state.retrievalConfidence < 0.7) {
      confidence = 0.3; // Below 0.6 will route to clarification_path
    } else {
      confidence = 0.9;
    }
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
