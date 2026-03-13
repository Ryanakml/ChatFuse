import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { IngestionSource } from '@wa-chat/shared';
import { getEmbeddings } from './embeddings.js';
import {
  getVectorStore,
  singleDocumentUpsert,
  clearDocumentChunks,
  addChunksToVectorStore,
} from './vectorstore.js';

export { singleDocumentUpsert, clearDocumentChunks, addChunksToVectorStore };

/**
 * Parses and loads documents based on type.
 * Note: PDF loader handles File/Blob/Buffer natively.
 * Here we assume content is either text or an absolute filePath for PDFs.
 * If content is plain text, we use TextLoader via a Blob/Buffer or just raw.
 */
export async function loadDocument(source: IngestionSource) {
  // For H1, we assume the content is raw text for simple sources.
  // If we had file URLs, we would fetch and parse.
  // Let's implement a base text-based loader.
  const docs = [
    {
      pageContent: source.content,
      metadata: {
        source: source.sourceUrl || 'inline-text',
        sourceType: source.sourceType,
        title: source.title,
        ...source.metadata,
      },
    },
  ];
  return docs;
}

export async function createDocuments(source: IngestionSource) {
  const docs = await loadDocument(source);
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  return textSplitter.createDocuments(
    docs.map((d) => d.pageContent),
    docs.map((d) => d.metadata),
  );
}

export async function ingestKnowledge(source: IngestionSource) {
  // 2. Upsert to DB to get `document_id`
  const docVersion = source.version || '1.0.0';
  const docMetadata = {
    sourceType: source.sourceType,
    ...(source.metadata || {}),
  };

  const storedDoc = await singleDocumentUpsert({
    source: source.sourceUrl || `manual-${Date.now()}`,
    title: source.title || null,
    content: source.content,
    version: docVersion,
    metadata: docMetadata,
  });

  // 3. Clear existing chunks for this specific document id (for updates)
  await clearDocumentChunks(storedDoc.id);

  // 4. Chunking
  const splitDocs = await createDocuments(source);

  // 5. Embedding & Upserting via VectorStore
  const embeddings = getEmbeddings();
  const vectorStore = getVectorStore(embeddings);

  await addChunksToVectorStore(vectorStore, splitDocs, storedDoc.id);

  return {
    documentId: storedDoc.id,
    chunksAdded: splitDocs.length,
    version: storedDoc.version,
  };
}
