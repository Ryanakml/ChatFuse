import { RunnableLambda } from '@langchain/core/runnables';
import type { AgentState } from '../types.js';

/**
 * Known prompt injection / jailbreak pattern fragments.
 * Case-insensitive. Checked against the original user input.
 *
 * Deliberately conservative — only flag phrases that are
 * unambiguous attempts to override system instructions.
 */
const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /you\s+are\s+(now\s+)?(a|an)\s+/i, // "you are now a ...", "you are an unrestricted AI"
  /act\s+as\s+(a|an)\s+/i, // "act as a hacker / DAN / ..."
  /pretend\s+(you\s+are|to\s+be)\s+/i,
  /roleplay\s+as\s+/i,
  /system\s*prompt\s*:/i, // exposing / overriding system prompt
  /```\s*system/i, // markdown fenced system block
  /\[SYSTEM\]/i, // explicit SYSTEM token injection
  /jailbreak/i,
  /do\s+anything\s+now/i, // "DAN" prompt variant
  /bypass\s+(your\s+)?(safety|policy|guideline)/i,
  /override\s+(your\s+)?(safety|policy|restriction)/i,
];

const BLOCKED_RESPONSE = 'I cannot process this request.';

/**
 * Step 7: Post-processing and policy filter chain.
 * Enforces output boundaries and finalizes response.
 * Also performs input-side prompt injection mitigation.
 */
export const policyChain = RunnableLambda.from(async (state: AgentState) => {
  // --- Input-side: prompt injection mitigation ---
  const inputStr =
    typeof state.originalInput === 'string'
      ? state.originalInput
      : JSON.stringify(state.originalInput ?? '');

  const isInjectionAttempt = PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(inputStr));

  if (isInjectionAttempt) {
    return {
      ...state,
      isSafe: false,
      intent: 'BLOCKED',
      finalResponse: BLOCKED_RESPONSE,
    } as AgentState;
  }

  // --- Output-side: content safety check ---
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
