import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export interface GeminiConfiguration {
  apiKey?: string;
  modelName?: string;
  temperature?: number;
  maxRetries?: number;
}

export function createGeminiAdapter(configuration?: GeminiConfiguration): ChatGoogleGenerativeAI {
  return new ChatGoogleGenerativeAI({
    apiKey: configuration?.apiKey ?? process.env.GEMINI_API_KEY ?? '',
    model: configuration?.modelName ?? 'gemini-1.5-flash',
    temperature: configuration?.temperature ?? 0,
    maxRetries: configuration?.maxRetries ?? 3,
  });
}
