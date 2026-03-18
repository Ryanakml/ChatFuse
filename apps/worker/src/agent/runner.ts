import type { BaseMessage } from '@langchain/core/messages';
import { getRecentMessages } from '../repositories/message-store.js';
import { WorkerPermanentError } from '../queue/consumer.js';

export type AgentRunnerInput = {
  message: string;
  conversationId: string;
  sender: string;
};

export type AgentRunnerResult = {
  text: string;
  route: 'llm' | 'fallback';
  metadata: {
    reason?: string;
    errorClass?: string;
    agentRoute: string | null;
    provider: string | null;
    intent: string | null;
    confidence: number | null;
    toolName: string | null;
    toolInput: Record<string, unknown> | null;
    toolOutput: unknown;
    toolDurationMs: number | null;
    toolSuccess: boolean | null;
  };
};

const hasProviderCredential = (value: string | undefined): boolean =>
  typeof value === 'string' && value.trim() !== '';

const resolveEnvKey = (
  primary: string | undefined,
  fallback: string | undefined,
): string | undefined => {
  if (hasProviderCredential(primary)) {
    return primary;
  }

  if (hasProviderCredential(fallback)) {
    return fallback;
  }

  return undefined;
};

export const runAgentPipeline = async (input: AgentRunnerInput): Promise<AgentRunnerResult> => {
  const resolvedOpenAiKey = resolveEnvKey(
    process.env.OPENAI_API_KEY,
    process.env.STAGING_OPENAI_API_KEY,
  );
  const resolvedGeminiKey = resolveEnvKey(
    process.env.GEMINI_API_KEY,
    process.env.STAGING_GEMINI_API_KEY,
  );

  if (resolvedOpenAiKey) {
    process.env.OPENAI_API_KEY = resolvedOpenAiKey;
  }

  if (resolvedGeminiKey) {
    process.env.GEMINI_API_KEY = resolvedGeminiKey;
  }

  const hasOpenAiKey = hasProviderCredential(process.env.OPENAI_API_KEY);
  const hasGeminiKey = hasProviderCredential(process.env.GEMINI_API_KEY);

  if (!hasOpenAiKey && !hasGeminiKey) {
    throw new WorkerPermanentError(
      'Agent pipeline is not configured: OPENAI_API_KEY or GEMINI_API_KEY is required',
    );
  }

  const rawHistory = await getRecentMessages(input.conversationId, { limit: 10 });
  const formattedHistory = rawHistory.map((message) => ({
    role: message.direction === 'inbound' ? 'user' : 'assistant',
    content: message.body,
  })) as unknown as BaseMessage[];

  const { processMessage } = await import('@wa-chat/llm');

  const state = await processMessage({
    payload: input.message,
    userId: input.sender,
    conversationId: input.conversationId,
    history: formattedHistory,
  } as Parameters<typeof processMessage>[0]);

  const toolExecution = (
    state as {
      toolExecution?: {
        toolName?: string | null;
        toolInput?: Record<string, unknown> | null;
        toolOutput?: unknown;
        toolDurationMs?: number | null;
        toolSuccess?: boolean | null;
      };
    }
  ).toolExecution;

  const finalText =
    typeof state.finalResponse === 'string' && state.finalResponse.trim() !== ''
      ? state.finalResponse.trim()
      : null;

  if (finalText) {
    return {
      text: finalText,
      route: 'llm',
      metadata: {
        agentRoute: state.route ?? null,
        provider: null,
        intent: state.intent ?? null,
        confidence: state.confidence ?? null,
        toolName: toolExecution?.toolName ?? null,
        toolInput: toolExecution?.toolInput ?? null,
        toolOutput: toolExecution?.toolOutput ?? null,
        toolDurationMs: toolExecution?.toolDurationMs ?? null,
        toolSuccess: toolExecution?.toolSuccess ?? null,
      },
    };
  }

  return {
    text: '',
    route: 'fallback',
    metadata: {
      reason: 'empty_final_response',
      agentRoute: state.route ?? null,
      provider: null,
      intent: state.intent ?? null,
      confidence: state.confidence ?? null,
      toolName: toolExecution?.toolName ?? null,
      toolInput: toolExecution?.toolInput ?? null,
      toolOutput: toolExecution?.toolOutput ?? null,
      toolDurationMs: toolExecution?.toolDurationMs ?? null,
      toolSuccess: toolExecution?.toolSuccess ?? null,
    },
  };
};
