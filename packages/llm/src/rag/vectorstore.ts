import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { Embeddings } from '@langchain/core/embeddings';
import { createClient } from '@supabase/supabase-js';
import type { KnowledgeDocument } from '@wa-chat/shared';
import { Document } from '@langchain/core/documents';
import { getEmbeddings } from './embeddings.js';

const supaUrl = process.env.SUPABASE_URL as string;
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

// Ensure we have a singleton supabase client for the vector store
export const supabaseClient = createClient(supaUrl, supaKey, {
  auth: { persistSession: false },
});

export const getVectorStore = (embeddings: Embeddings) => {
  return new SupabaseVectorStore(embeddings, {
    client: supabaseClient,
    tableName: 'knowledge_chunks',
    queryName: 'match_knowledge_chunks', // Supabase function name for retrieval (not part of H1 but standard)
  });
};

/**
 * Upsert a knowledge document to the database.
 * If conflict on (source, version), it will update it (or fail based on Postgres constraint).
 * Note: the schema defines a unique constraint on (source, version).
 */
export async function singleDocumentUpsert(
  doc: Omit<KnowledgeDocument, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<KnowledgeDocument> {
  const { data, error } = await supabaseClient
    .from('knowledge_documents')
    .upsert(
      {
        source: doc.source,
        title: doc.title,
        content: doc.content,
        version: doc.version,
        metadata: doc.metadata,
      },
      { onConflict: 'source,version', ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert knowledge document: ${error.message}`);
  }

  return data as KnowledgeDocument;
}

/**
 * Delete existing chunks for a document to cleanly replace them.
 */
export async function clearDocumentChunks(documentId: string): Promise<void> {
  const { error } = await supabaseClient
    .from('knowledge_chunks')
    .delete()
    .eq('document_id', documentId);

  if (error) {
    throw new Error(`Failed to clear knowledge chunks for doc ${documentId}: ${error.message}`);
  }
}

/**
 * Delete a document and its associated chunks from the database.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  // 1. Clear the chunks first due to foreign key constraints
  await clearDocumentChunks(documentId);

  // 2. Clear the document record
  const { error } = await supabaseClient
    .from('knowledge_documents')
    .delete()
    .eq('id', documentId);

  if (error) {
    throw new Error(`Failed to delete knowledge document ${documentId}: ${error.message}`);
  }
}

/**
 * Add chunks explicitly into knowledge_chunks with required schema columns.
 * This avoids relying on vector-store metadata mapping for document_id/chunk_index.
 */
export async function addChunksToVectorStore(
  _vectorStore: SupabaseVectorStore,
  chunks: Document<Record<string, unknown>>[],
  documentId: string,
): Promise<void> {
  const embeddings = getEmbeddings();
  const chunkContents = chunks.map((chunk) => chunk.pageContent);
  const vectors = await embeddings.embedDocuments(chunkContents);

  const rows = chunks.map((chunk, index) => {
    const metadata =
      chunk.metadata && typeof chunk.metadata === 'object'
        ? chunk.metadata
        : ({} as Record<string, unknown>);

    return {
      document_id: documentId,
      chunk_index: index,
      content: chunk.pageContent,
      embedding: vectors[index],
      metadata,
    };
  });

  const { error } = await supabaseClient
    .from('knowledge_chunks')
    .upsert(rows, { onConflict: 'document_id,chunk_index', ignoreDuplicates: false });

  if (error) {
    throw new Error(`Failed to upsert knowledge chunks: ${error.message}`);
  }
}

export interface RetrievalFilters {
  // Support metadata filters like locale, productLine, policyVersion, etc.
  [key: string]: unknown;
}

/**
 * Perform a similarity search on the vector store with a score threshold and metadata filters.
 */
export async function searchKnowledge(
  vectorStore: SupabaseVectorStore,
  query: string,
  k: number = 4,
  threshold: number = 0.7,
  filters?: RetrievalFilters,
): Promise<[Document, number][]> {
  // Translate filters to what SupabaseVectorStore expects for its match_knowledge_chunks RPC
  // The official LangChain SupabaseVectorStore accepts an object which maps to metadata->>key=value
  const searchFilter = filters && Object.keys(filters).length > 0 ? filters : undefined;

  const results = await vectorStore.similaritySearchWithScore(query, k, searchFilter);

  // Filter out any results that do not meet the confidence threshold
  return results.filter((result) => result[1] >= threshold);
}
