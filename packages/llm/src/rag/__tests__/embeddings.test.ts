import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOpenAiEmbedDocuments = vi.fn();
const mockOpenAiEmbedQuery = vi.fn();
const mockGeminiEmbedDocuments = vi.fn();
const mockGeminiEmbedQuery = vi.fn();

vi.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: vi.fn(function MockOpenAIEmbeddings() {
    return {
      embedDocuments: mockOpenAiEmbedDocuments,
      embedQuery: mockOpenAiEmbedQuery,
    };
  }),
}));

vi.mock('@langchain/google-genai', () => ({
  GoogleGenerativeAIEmbeddings: vi.fn(function MockGeminiEmbeddings() {
    return {
      embedDocuments: mockGeminiEmbedDocuments,
      embedQuery: mockGeminiEmbedQuery,
    };
  }),
}));

import { PrimaryFallbackEmbeddings, adaptVectorDimensions } from '../embeddings.js';

describe('adaptVectorDimensions', () => {
  it('zero-pads smaller vectors up to target size', () => {
    const adapted = adaptVectorDimensions([1, 2, 3], 7);

    expect(adapted).toEqual([1, 2, 3, 0, 0, 0, 0]);
  });

  it('trims vectors larger than target size', () => {
    const adapted = adaptVectorDimensions([1, 2, 3, 4], 2);

    expect(adapted).toEqual([1, 2]);
  });

  it('returns zeros for an empty vector', () => {
    const adapted = adaptVectorDimensions([], 4);

    expect(adapted).toEqual([0, 0, 0, 0]);
  });
});

describe('PrimaryFallbackEmbeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses OpenAI embeddings when primary succeeds', async () => {
    mockOpenAiEmbedQuery.mockResolvedValue([0.1, 0.2, 0.3]);

    const embeddings = new PrimaryFallbackEmbeddings();
    const vector = await embeddings.embedQuery('halo');

    expect(vector).toEqual([0.1, 0.2, 0.3]);
    expect(mockGeminiEmbedQuery).not.toHaveBeenCalled();
  });

  it('falls back to Gemini and adapts dimensions for query embeddings', async () => {
    mockOpenAiEmbedQuery.mockRejectedValue(new Error('openai 429'));
    mockGeminiEmbedQuery.mockResolvedValue(Array.from({ length: 768 }, (_, i) => i));

    const embeddings = new PrimaryFallbackEmbeddings();
    const vector = await embeddings.embedQuery('halo');

    expect(vector).toHaveLength(1536);
    expect(vector[0]).toBe(0);
    expect(vector[767]).toBe(767);
    expect(vector[768]).toBe(0);
    expect(vector[1535]).toBe(0);
  });

  it('falls back to Gemini and adapts dimensions for document embeddings', async () => {
    mockOpenAiEmbedDocuments.mockRejectedValue(new Error('openai 429'));
    mockGeminiEmbedDocuments.mockResolvedValue([
      Array.from({ length: 768 }, (_, i) => i + 1),
      Array.from({ length: 768 }, (_, i) => i + 10),
    ]);

    const embeddings = new PrimaryFallbackEmbeddings();
    const vectors = await embeddings.embedDocuments(['a', 'b']);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(1536);
    expect(vectors[1]).toHaveLength(1536);
    expect(vectors[0]?.[0]).toBe(1);
    expect(vectors[0]?.[768]).toBe(0);
  });
});
