import { Embeddings } from '@langchain/core/embeddings';
import { OpenAIEmbeddings } from '@langchain/openai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

const VECTOR_DIMENSION_TARGET = 1536;

/**
 * Lifts or trims vectors to a fixed size expected by the current pgvector schema.
 * This keeps fallback providers usable even when native dimensions differ.
 */
export function adaptVectorDimensions(
  vector: number[],
  targetDimension: number = VECTOR_DIMENSION_TARGET,
): number[] {
  if (vector.length === targetDimension) {
    return vector;
  }

  if (vector.length === 0) {
    return Array.from({ length: targetDimension }, () => 0);
  }

  if (vector.length > targetDimension) {
    return vector.slice(0, targetDimension);
  }

  return [...vector, ...Array.from({ length: targetDimension - vector.length }, () => 0)];
}

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
      dimensions: VECTOR_DIMENSION_TARGET,
    });
    this.fallback = new GoogleGenerativeAIEmbeddings({
      modelName: 'text-embedding-004',
    });
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    try {
      return await this.primary.embedDocuments(texts);
    } catch (primaryError) {
      try {
        const fallbackVectors = await this.fallback.embedDocuments(texts);
        return fallbackVectors.map((vector) =>
          adaptVectorDimensions(vector, VECTOR_DIMENSION_TARGET),
        );
      } catch (fallbackError) {
        console.warn('OpenAI and fallback embeddings both failed.', {
          primaryError,
          fallbackError,
        });
        throw primaryError;
      }
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    try {
      return await this.primary.embedQuery(text);
    } catch (primaryError) {
      try {
        const fallbackVector = await this.fallback.embedQuery(text);
        return adaptVectorDimensions(fallbackVector, VECTOR_DIMENSION_TARGET);
      } catch (fallbackError) {
        console.warn('OpenAI and fallback embeddings both failed.', {
          primaryError,
          fallbackError,
        });
        throw primaryError;
      }
    }
  }
}

export const getEmbeddings = (): Embeddings => {
  return new PrimaryFallbackEmbeddings();
};
