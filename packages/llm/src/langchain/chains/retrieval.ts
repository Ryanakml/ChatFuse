import { RunnableLambda } from '@langchain/core/runnables';
import type { AgentState } from '../types.js';
import { getVectorStore, searchKnowledge } from '../../rag/vectorstore.js';
import { getEmbeddings } from '../../rag/embeddings.js';

/**
 * Step 2: Session/context retrieval step.
 * Fetches recent history/context and performs semantic search for RAG.
 */
export const retrievalChain = RunnableLambda.from(async (state: AgentState) => {
  let retrievedContext = '';
  let highestConfidence = 0;

  if (state.normalizedInput) {
    const vectorStore = getVectorStore(getEmbeddings());

    // Example: extracting metadata filters if they existed in state context
    // const filters = { locale: 'en-US' };

    // Perform semantic search with a threshold
    const results = await searchKnowledge(vectorStore, state.normalizedInput, 4, 0.7);

    const firstResult = results[0];
    if (results.length > 0 && firstResult) {
      highestConfidence = firstResult[1];
      retrievedContext = results.map((result) => result[0]?.pageContent || '').join('\n\n');
    }
  }

  return {
    ...state,
    retrievedContext,
    retrievalConfidence: highestConfidence,
    context: {
      userId: state.context?.userId || 'unknown-user',
      conversationId: state.context?.conversationId || 'unknown-convo',
      history: state.context?.history || [],
    },
  };
});
