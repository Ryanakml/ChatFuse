import { RunnableLambda } from '@langchain/core/runnables';
import { appMetrics, logger } from '@wa-chat/shared';
import type { AgentState } from '../types.js';
import { classifyIntentWithGroq } from './groq-classifier.js';

const isValidConfidence = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

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

export const keywordFallbackIntent = (
  input: string,
): Extract<AgentState['intent'], 'RAG' | 'TOOL' | 'ESCALATION' | 'CLARIFICATION'> => {
  const lowerInput = input.toLowerCase();

  if (toolKeywords.some((keyword) => lowerInput.includes(keyword))) {
    return 'TOOL';
  }

  if (ragKeywords.some((keyword) => lowerInput.includes(keyword))) {
    return 'RAG';
  }

  if (escalationKeywords.some((keyword) => lowerInput.includes(keyword))) {
    return 'ESCALATION';
  }

  return 'CLARIFICATION';
};

/**
 * Step 3: Intent classification chain.
 * Determines what the user wants based on normalized input.
 */
export const classificationChain = RunnableLambda.from(async (state: AgentState) => {
  const input = state.normalizedInput?.trim() ?? '';

  if (input === '') {
    return {
      ...state,
      intent: 'CLARIFICATION',
      confidence: isValidConfidence(state.confidence) ? state.confidence : 0.5,
    };
  }

  try {
    const classified = await classifyIntentWithGroq(input);
    logger.debug(
      {
        classificationSource: 'GROQ',
        intent: classified.intent,
        confidence: classified.confidence,
      },
      'Intent classification completed',
    );

    return {
      ...state,
      intent: classified.intent,
      confidence: isValidConfidence(state.confidence) ? state.confidence : classified.confidence,
    };
  } catch (error) {
    const fallbackIntent = keywordFallbackIntent(input);
    appMetrics.agentParseFailureCount?.add?.(1, {
      stage: 'intent_classification',
      source: 'fallback',
    });
    logger.warn(
      {
        error,
        classificationSource: 'FALLBACK',
        intent: fallbackIntent,
      },
      'Groq intent classification failed, fallback used',
    );

    return {
      ...state,
      intent: fallbackIntent,
      confidence: isValidConfidence(state.confidence) ? state.confidence : 0.5,
    };
  }
});
