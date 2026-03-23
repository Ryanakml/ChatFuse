import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('../../../rag/embeddings.js', () => ({
  getEmbeddings: vi.fn().mockReturnValue({
    embedDocuments: vi.fn().mockResolvedValue([[0.1]]),
    embedQuery: vi.fn().mockResolvedValue([0.1]),
  }),
}));
vi.mock('../../../rag/vectorstore.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../rag/vectorstore.js')>();
  return {
    ...actual,
    getVectorStore: vi.fn().mockReturnValue({
      similaritySearchWithScore: vi.fn().mockResolvedValue([]),
    }),
  };
});
import type { MockInstance } from 'vitest';
import { retrievalChain } from '../retrieval.js';
import * as vectorstoreHooks from '../../../rag/vectorstore.js';
import type { AgentState } from '../../types.js';
import { Document } from '@langchain/core/documents';

describe('retrievalChain', () => {
  let searchSpy: MockInstance;

  beforeEach(() => {
    searchSpy = vi.spyOn(vectorstoreHooks, 'searchKnowledge');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should perform semantic search and populate retrievedContext if normalizedInput is present', async () => {
    searchSpy.mockResolvedValue([[new Document({ pageContent: 'Docs about our policies' }), 0.85]]);

    const state: AgentState = {
      originalInput: 'hello',
      normalizedInput: 'hello query',
      context: { userId: '1', conversationId: '2', history: [] },
    };

    const result = await retrievalChain.invoke(state);

    expect(searchSpy).toHaveBeenCalled();
    expect(result.retrievedContext).toBe('Docs about our policies');
    expect(result.retrievalConfidence).toBe(0.85);
  });

  it('should not populate retrievedContext if search returns nothing', async () => {
    searchSpy.mockResolvedValue([]);

    const state: AgentState = {
      originalInput: 'hello',
      normalizedInput: 'hello query',
      context: { userId: '1', conversationId: '2', history: [] },
    };

    const result = await retrievalChain.invoke(state);

    expect(searchSpy).toHaveBeenCalled();
    expect(result.retrievedContext).toBe('');
    expect(result.retrievalConfidence).toBe(0);
  });

  it('uses RAG_CONFIDENCE_THRESHOLD when configured', async () => {
    process.env.RAG_CONFIDENCE_THRESHOLD = '0.82';
    searchSpy.mockResolvedValue([]);

    const state: AgentState = {
      originalInput: 'hello',
      normalizedInput: 'hello query',
      context: { userId: '1', conversationId: '2', history: [] },
    };

    await retrievalChain.invoke(state);

    expect(searchSpy).toHaveBeenCalledWith(expect.anything(), 'hello query', 4, 0.82);
    delete process.env.RAG_CONFIDENCE_THRESHOLD;
  });
});
