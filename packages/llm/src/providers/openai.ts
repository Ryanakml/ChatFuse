import { ChatOpenAI } from '@langchain/openai';

export interface OpenAIConfiguration {
  apiKey?: string;
  modelName?: string;
  temperature?: number;
  maxRetries?: number;
}

export function createOpenAIAdapter(configuration?: OpenAIConfiguration): ChatOpenAI {
  return new ChatOpenAI({
    openAIApiKey: configuration?.apiKey ?? process.env.OPENAI_API_KEY ?? 'dummy-key',
    modelName: configuration?.modelName ?? 'gpt-4o-mini',
    temperature: configuration?.temperature ?? 0,
    maxRetries: configuration?.maxRetries ?? 3,
  });
}
