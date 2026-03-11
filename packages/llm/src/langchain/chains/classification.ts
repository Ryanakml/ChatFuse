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
  const toolKeywords = ['pesanan', 'status', 'lacak', 'cek', 'order', 'track'];
  const ragKeywords = [
    'bantuan',
    'bagaimana',
    'apa',
    'kenapa',
    'mengapa',
    'kebijakan',
    'return',
    'help',
    'how',
    'what',
    'why',
    'policy',
  ];
  const escalationKeywords = [
    'manajer',
    'manusia',
    'agen',
    'cs',
    'customer service',
    'manager',
    'human',
    'agent',
  ];

  if (toolKeywords.some((keyword) => input.includes(keyword))) {
    intent = 'TOOL';
  } else if (ragKeywords.some((keyword) => input.includes(keyword))) {
    intent = 'RAG';
  } else if (escalationKeywords.some((keyword) => input.includes(keyword))) {
    intent = 'ESCALATION';
  } else {
    intent = 'CLARIFICATION';
  }

  return {
    ...state,
    intent,
  };
});
