import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestKnowledge } from '../ingestion.js';
import type { IngestionSource } from '@wa-chat/shared';
import * as embeddingsModule from '../embeddings.js';
import * as vectorstoreModule from '../vectorstore.js';
import { Embeddings } from '@langchain/core/embeddings';

// Mock the vectorstore module
vi.mock('../vectorstore.js', () => ({
  getVectorStore: vi.fn(),
  singleDocumentUpsert: vi.fn().mockResolvedValue({
    id: 'mock-doc-id',
    source: 'test-source',
    version: '1.0.0',
    content: 'mock content',
  }),
  clearDocumentChunks: vi.fn().mockResolvedValue(undefined),
  addChunksToVectorStore: vi.fn().mockResolvedValue(undefined),
}));

// Mock the embeddings module
vi.mock('../embeddings.js', () => ({
  getEmbeddings: vi.fn().mockReturnValue({
    embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2]]),
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2]),
  } as unknown as Embeddings),
}));

describe('Knowledge Ingestion Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse, chunk, embed, and upsert a basic text document', async () => {
    const source: IngestionSource = {
      sourceType: 'faq',
      title: 'Test FAQ',
      content: 'This is a test FAQ document. It has some text that will be chunked and embedded.',
      version: '1.0.1',
    };

    const result = await ingestKnowledge(source);

    expect(vectorstoreModule.singleDocumentUpsert).toHaveBeenCalledWith({
      source: expect.any(String),
      title: 'Test FAQ',
      content: source.content,
      version: '1.0.1',
      metadata: { sourceType: 'faq' },
    });

    expect(vectorstoreModule.clearDocumentChunks).toHaveBeenCalledWith('mock-doc-id');

    expect(vectorstoreModule.getVectorStore).toHaveBeenCalled();
    expect(embeddingsModule.getEmbeddings).toHaveBeenCalled();

    expect(vectorstoreModule.addChunksToVectorStore).toHaveBeenCalledWith(
      undefined, // getVectorStore is mocked to return undefined empty fn
      expect.arrayContaining([
        expect.objectContaining({
          pageContent: source.content,
        }),
      ]),
      'mock-doc-id',
    );

    expect(result).toEqual({
      documentId: 'mock-doc-id',
      chunksAdded: 1, // small document so 1 chunk
      version: '1.0.0', // from the mock return value
    });
  });

  it('should handle large documents by splitting into multiple chunks', async () => {
    // Generate a long string to force multiple chunks
    const longContent = Array.from({ length: 2000 }, () => 'word').join(' ');

    const source: IngestionSource = {
      sourceType: 'policy',
      content: longContent,
    };

    const result = await ingestKnowledge(source);

    expect(result.chunksAdded).toBeGreaterThan(1);
    expect(vectorstoreModule.addChunksToVectorStore).toHaveBeenCalledWith(
      undefined,
      expect.arrayContaining([expect.objectContaining({ pageContent: expect.any(String) })]),
      'mock-doc-id',
    );
  });
});
