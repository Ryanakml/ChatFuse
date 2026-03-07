// removed BaseChatModel import
import { RunnableWithFallbacks } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
import { createOpenAIAdapter } from '../providers/openai.js';
import type { OpenAIConfiguration } from '../providers/openai.js';
import { createGeminiAdapter } from '../providers/gemini.js';
import type { GeminiConfiguration } from '../providers/gemini.js';

export interface ModelRouterConfig {
  primaryConfig?: OpenAIConfiguration;
  fallbackConfig?: GeminiConfiguration;
}

/**
 * Creates a model router with OpenAI as the primary model and Gemini as the fallback.
 * Uses LangChain's withFallbacks mechanism. Retry rules are scoped per provider
 * through their respective configurations.
 */
export function createModelRouter(
  config?: ModelRouterConfig,
): RunnableWithFallbacks<unknown, AIMessage> {
  // 1. OpenAI as primary model (configured with its own retry rules)
  const primaryModel = createOpenAIAdapter(config?.primaryConfig);

  // 2. Gemini as fallback on defined failure conditions (configured with its own retry rules)
  const fallbackModel = createGeminiAdapter(config?.fallbackConfig);

  return primaryModel.withFallbacks({
    fallbacks: [fallbackModel],
  });
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostEstimate {
  usage: TokenUsage;
  estimatedCostUsd: number;
  provider: 'openai' | 'gemini' | 'unknown';
}

// Very basic cost estimation mapping (could be expanded or moved to config)
const COST_RATES_PER_1K: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 }, // Estimate
};

/**
 * 4. Token/cost accounting per response.
 * Parses the AIMessage to extract token usage and estimate cost.
 */
export function calculateResponseCost(response: AIMessage, modelName: string): CostEstimate {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metadata = (response as any).usage_metadata;
  const usage: TokenUsage = {
    inputTokens: metadata?.input_tokens ?? 0,
    outputTokens: metadata?.output_tokens ?? 0,
    totalTokens: metadata?.total_tokens ?? 0,
  };

  let estimatedCostUsd = 0;
  const rates = COST_RATES_PER_1K[modelName];

  if (rates) {
    estimatedCostUsd =
      (usage.inputTokens / 1000) * rates.input + (usage.outputTokens / 1000) * rates.output;
  }

  let provider: CostEstimate['provider'] = 'unknown';
  if (modelName.includes('gpt')) provider = 'openai';
  if (modelName.includes('gemini')) provider = 'gemini';

  return {
    usage,
    estimatedCostUsd,
    provider,
  };
}
