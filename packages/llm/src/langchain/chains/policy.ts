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

  return {
    ...state,
    isSafe,
    finalResponse,
  };
});
