import { RunnableSequence, Runnable } from '@langchain/core/runnables';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { AgentState } from './types.js';
import { normalizationChain } from './chains/normalization.js';
import { retrievalChain } from './chains/retrieval.js';
import { classificationChain } from './chains/classification.js';
import { confidenceChain } from './chains/confidence.js';
import { routerChain } from './chains/router.js';
import { compositionChain } from './chains/composition.js';
import { policyChain } from './chains/policy.js';

export interface ChainConfig<Output = unknown> {
  prompt: ChatPromptTemplate;
  model: BaseChatModel;
  parser?: BaseOutputParser<Output>;
}

/**
 * Composes a standard LangChain sequence (Prompt -> Model -> Optional Parser)
 */
export function createStandardChain<Input = unknown, Output = unknown>(
  config: ChainConfig<Output>,
): RunnableSequence<Input, Output> {
  const { prompt, model, parser } = config;

  let sequence: Runnable = prompt.pipe(model);

  if (parser) {
    sequence = sequence.pipe(parser);
  }

  return sequence as RunnableSequence<Input, Output>;
}

/**
 * The core orchestration graph/sequence for processing an inbound message.
 * Handles normalization -> retrieval -> classify -> confidence -> route -> compose -> policy
 */
export const processMessagePipeline = RunnableSequence.from([
  normalizationChain,
  retrievalChain,
  classificationChain,
  confidenceChain,
  routerChain,
  compositionChain,
  policyChain,
]);

/**
 * Entry point to process a new message through the orchestration flow.
 */
export async function processMessage(input: {
  payload: Record<string, unknown> | string;
  userId: string;
  conversationId: string;
}): Promise<AgentState> {
  const initialState: AgentState = {
    originalInput: input.payload,
    context: {
      userId: input.userId,
      conversationId: input.conversationId,
      history: [],
    },
  };

  return processMessagePipeline.invoke(initialState);
}
