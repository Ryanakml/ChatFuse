import { RunnableLambda } from '@langchain/core/runnables';
import type { AgentState } from '../types.js';

/**
 * Step 6: Response composition chain.
 * Composes the final response string based on the chosen route.
 */
export const compositionChain = RunnableLambda.from(async (state: AgentState) => {
  let composedResponse = '';

  switch (state.route) {
    case 'rag_path':
      composedResponse = `[RAG RESPONSE] Based on our knowledge base, here is the answer to your query: ${state.normalizedInput}`;
      break;
    case 'tool_path':
      composedResponse = `[TOOL RESPONSE] I am looking up the information using our tools for: ${state.normalizedInput}`;
      break;
    case 'escalation_path':
      composedResponse = `[ESCALATION RESPONSE] I am transferring you to a human agent who can help with your request.`;
      break;
    case 'clarification_path':
    default:
      composedResponse = `[CLARIFICATION RESPONSE] I'm not entirely sure what you mean by "${state.normalizedInput}". Could you please clarify?`;
      break;
  }

  return {
    ...state,
    composedResponse,
  };
});
