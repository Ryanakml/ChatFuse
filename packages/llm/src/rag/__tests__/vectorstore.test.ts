import { describe, it, expect, vi } from 'vitest';
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
import { searchKnowledge } from '../vectorstore.js';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { Document } from '@langchain/core/documents';

describe('vectorstore searchKnowledge', () => {
  it('should filter results below the threshold', async () => {
    const mockResults: [Document, number][] = [
      [new Document({ pageContent: 'High match' }), 0.9],
      [new Document({ pageContent: 'Medium match' }), 0.75],
      [new Document({ pageContent: 'Low match' }), 0.4],
    ];

    const mockVectorStore = {
      similaritySearchWithScore: vi.fn().mockResolvedValue(mockResults),
    } as unknown as SupabaseVectorStore;

    const results = await searchKnowledge(mockVectorStore, 'query', 4, 0.7);

    expect(results).toHaveLength(2);
    expect(results[0]?.[0]?.pageContent).toBe('High match');
    expect(results[1]?.[0]?.pageContent).toBe('Medium match');
    expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith('query', 4, undefined);
  });

  it('should pass metadata filters correctly', async () => {
    const mockVectorStore = {
      similaritySearchWithScore: vi.fn().mockResolvedValue([]),
    } as unknown as SupabaseVectorStore;

    await searchKnowledge(mockVectorStore, 'query', 4, 0.7, { locale: 'en-US' });

    expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith('query', 4, {
      locale: 'en-US',
    });
  });
});
