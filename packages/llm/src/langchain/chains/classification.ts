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
const GREETING_PATTERN =
  /\b(halo|hai|hi|hello|pagi|siang|sore|malam|assalamualaikum|makasih|terima kasih|thanks|thank you)\b/i;

const isPhoneOnlyInput = (input: string): boolean =>
  /^(?:\+?62|0)?8\d{7,12}$/.test(input.replace(/[\s()-]/g, ''));
const isAffirmativeInput = (input: string): boolean =>
  /^(ya|iya|yes|y|ok|oke|lanjut|silakan|gas)\b/i.test(input.trim());

const getLastAssistantMessage = (state: AgentState): string => {
  const history = state.context?.history ?? [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message) {
      continue;
    }
    if (message.type !== 'ai') {
      continue;
    }
    if (typeof message.content === 'string') {
      return message.content;
    }
  }
  return '';
};

const hasPendingToolCue = (state: AgentState): boolean => {
  const lastAssistantMessage = getLastAssistantMessage(state).toLowerCase();
  if (!lastAssistantMessage) {
    return false;
  }

  const supportConfirmationCue =
    (lastAssistantMessage.includes('balas dengan') &&
      (lastAssistantMessage.includes("'ya'") || lastAssistantMessage.includes('konfirmasi'))) ||
    (lastAssistantMessage.includes('reply with') && lastAssistantMessage.includes("'yes'"));

  const orderRetryCue =
    (lastAssistantMessage.includes('cari pesanan') && lastAssistantMessage.includes('lagi')) ||
    lastAssistantMessage.includes('mencari pesanan anda lagi');

  return supportConfirmationCue || orderRetryCue;
};

export const keywordFallbackIntent = (
  input: string,
): Extract<AgentState['intent'], 'RAG' | 'TOOL' | 'ESCALATION' | 'CLARIFICATION' | 'GREETING'> => {
  const lowerInput = input.toLowerCase();

  if (GREETING_PATTERN.test(lowerInput)) {
    return 'GREETING';
  }

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
      classifiedIntent: 'CLARIFICATION',
      classifiedConfidence: 0.5,
      confidence: isValidConfidence(state.confidence) ? state.confidence : 0.5,
    };
  }

  // Deterministic overrides for short follow-up turns.
  if (isPhoneOnlyInput(input)) {
    return {
      ...state,
      intent: 'TOOL',
      classifiedIntent: 'TOOL',
      classifiedConfidence: 0.95,
      confidence: 0.95,
    };
  }

  if (isAffirmativeInput(input) && hasPendingToolCue(state)) {
    return {
      ...state,
      intent: 'TOOL',
      classifiedIntent: 'TOOL',
      classifiedConfidence: 0.95,
      confidence: 0.95,
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
      classifiedIntent: classified.intent,
      classifiedConfidence: classified.confidence,
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
      classifiedIntent: fallbackIntent,
      classifiedConfidence: 0.5,
      confidence: isValidConfidence(state.confidence) ? state.confidence : 0.5,
    };
  }
});
