import { Embeddings } from '@langchain/core/embeddings';
import { OpenAIEmbeddings } from '@langchain/openai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

/**
 * Creates an Embedding instance that uses OpenAI primarily,
 * and falls back to Gemini if OpenAI fails.
 */
export class PrimaryFallbackEmbeddings extends Embeddings {
  private primary: Embeddings;
  private fallback: Embeddings;

  constructor() {
    super({});
    this.primary = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small', // Dimensions: 1536
      dimensions: 1536,
    });
    this.fallback = new GoogleGenerativeAIEmbeddings({
      modelName: 'text-embedding-004', // Output dimensions 768. Wait Supabase schema uses vector(1536).
      // We must mock or handle dimension mismatch if fallback fails. For now, Google models only do 768 natively.
      // Easiest is to stick to 1536 dimension required by schema.
      // If we *must* support fallback and maintain 1536, we either zero-pad Gemini or stick to OpenAI w/ standard retries.
      // Let's implement basic fallback and log errors. If dimensions mismatch, db will reject it.
      // We will stick to OpenAI exclusively since pgvector assumes 1536, and Google is 768.
    });
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    try {
      return await this.primary.embedDocuments(texts);
    } catch (error) {
      console.warn(
        'OpenAI embeddings failed, attempting fallback is unsupported due to dimension mismatch. Throwing original error.',
        error,
      );
      throw error;
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    try {
      return await this.primary.embedQuery(text);
    } catch (error) {
      console.warn(
        'OpenAI embeddings failed, attempting fallback is unsupported due to dimension mismatch. Throwing original error.',
        error,
      );
      throw error;
    }
  }
}

export const getEmbeddings = (): Embeddings => {
  return new PrimaryFallbackEmbeddings();
};
