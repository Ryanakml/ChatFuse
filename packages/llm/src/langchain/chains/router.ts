import { RunnableBranch, RunnableLambda, Runnable } from '@langchain/core/runnables';
import type { AgentState } from '../types.js';

// Define the individual path handlers
const ragPath = RunnableLambda.from(async (state: AgentState) => {
  return { ...state, route: 'rag_path' as const };
});

const toolPath = RunnableLambda.from(async (state: AgentState) => {
  return { ...state, route: 'tool_path' as const };
});

const clarificationPath = RunnableLambda.from(async (state: AgentState) => {
  return { ...state, route: 'clarification_path' as const };
});

const escalationPath = RunnableLambda.from(async (state: AgentState) => {
  return { ...state, route: 'escalation_path' as const };
});

/**
 * Step 5: Decision router.
 * Routes to the correct path based on intent and confidence.
 */
export const routerChain = RunnableBranch.from([
  [
    (state: AgentState) => state.intent === 'ESCALATION' || (state.confidence ?? 0) < 0.3,
    escalationPath as Runnable,
  ],
  [
    (state: AgentState) => state.intent === 'CLARIFICATION' || (state.confidence ?? 0) < 0.6,
    clarificationPath as Runnable,
  ],
  [(state: AgentState) => state.intent === 'TOOL', toolPath as Runnable],
  [(state: AgentState) => state.intent === 'RAG', ragPath as Runnable],
  clarificationPath as Runnable, // Fallback
]);
