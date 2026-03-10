import { WorkerPermanentError } from '../queue/consumer.js';

export type AgentRunnerInput = {
  message: string;
  conversationId: string;
  sender: string;
};

export type AgentRunnerResult = {
  text: string;
  route: 'llm' | 'fallback';
  metadata: Record<string, unknown>;
};

const hasProviderCredential = (value: string | undefined): boolean =>
  typeof value === 'string' && value.trim() !== '';

export const runAgentPipeline = async (input: AgentRunnerInput): Promise<AgentRunnerResult> => {
  const hasOpenAiKey = hasProviderCredential(process.env.OPENAI_API_KEY);
  const hasGeminiKey = hasProviderCredential(process.env.GEMINI_API_KEY);

  if (!hasOpenAiKey && !hasGeminiKey) {
    throw new WorkerPermanentError(
      'Agent pipeline is not configured: OPENAI_API_KEY or GEMINI_API_KEY is required',
    );
  }

  const { processMessage } = await import('@wa-chat/llm');

  const state = await processMessage({
    payload: input.message,
    userId: input.sender,
    conversationId: input.conversationId,
  });

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
        intent: state.intent ?? null,
        confidence: state.confidence ?? null,
      },
    };
  }

  return {
    text: '',
    route: 'fallback',
    metadata: {
      reason: 'empty_final_response',
      agentRoute: state.route ?? null,
      intent: state.intent ?? null,
      confidence: state.confidence ?? null,
    },
  };
};
