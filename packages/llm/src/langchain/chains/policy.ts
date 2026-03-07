import { RunnableLambda } from '@langchain/core/runnables';
import type { AgentState } from '../types.js';

/**
 * Step 7: Post-processing and policy filter chain.
 * Enforces output boundaries and finalizes response.
 */
export const policyChain = RunnableLambda.from(async (state: AgentState) => {
  // Simple mock policy enforcement
  const isSafe = !state.composedResponse?.toLowerCase().includes('inappropriate');

  let finalResponse = state.composedResponse || '';
  if (!isSafe) {
    finalResponse = 'I cannot fulfill this request due to policy restrictions.';
  }

  // Enforce grounded response on low RAG retrieval confidence
  if (
    state.intent === 'RAG' &&
    state.retrievalConfidence !== undefined &&
    state.retrievalConfidence < 0.7
  ) {
    finalResponse = 'I need clarification';
  }

  const updatedState = {
    ...state,
    isSafe,
    finalResponse,
  };

  // Escalate naturally if clarifying
  if (finalResponse === 'I need clarification' && state.intent !== 'ESCALATION') {
    updatedState.intent = 'CLARIFICATION';
  }

  return updatedState as AgentState;
});
