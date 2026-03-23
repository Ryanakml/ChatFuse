import { Router, type Request, type Response } from 'express';
import { logger } from '@wa-chat/shared';
import { ingestKnowledge, deleteDocument } from '@wa-chat/llm/dist/rag/ingestion.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const knowledgeRouter = Router();

// Create a Supabase client just for reading the list of documents
let _supabase: SupabaseClient | null = null;
const getSupabaseClient = () => {
  if (!_supabase) {
    const supaUrl = process.env.SUPABASE_URL as string;
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!supaUrl || !supaKey) {
      throw new Error('Supabase URL and Key are required');
    }
    _supabase = createClient(supaUrl, supaKey, {
      auth: { persistSession: false },
    });
  }
  return _supabase;
};

knowledgeRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('knowledge_documents')
      .select('id, source, title, version, metadata, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({ documents: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ event: 'api.knowledge.list.error', message }, 'Failed to list knowledge docs');
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

knowledgeRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { content, title, sourceType, sourceUrl } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Content is required and must be a string' });
      return;
    }

    const type = sourceType || 'inline';
    const source = sourceUrl || `manual-${type}-${Date.now()}`;

    const result = await ingestKnowledge({
      content,
      title: title || 'Untitled Document',
      sourceType: type,
      sourceUrl: source,
      version: '1.0.0',
    });

    res.status(200).json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ event: 'api.knowledge.upload.error', message }, 'Failed to upload knowledge');
    res.status(500).json({ error: 'Failed to ingest knowledge: ' + message });
  }
});

knowledgeRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }
    // If id is an array, use the first element; otherwise, use as is
    const docId = Array.isArray(id) ? id[0] : id;
    if (typeof docId !== 'string') {
      res.status(400).json({ error: 'Document ID must be a string' });
      return;
    }
    await deleteDocument(docId);
    res.status(200).json({ success: true, deletedId: docId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { event: 'api.knowledge.delete.error', message, documentId: req.params.id },
      'Failed to delete knowledge',
    );
    res.status(500).json({ error: 'Failed to delete document: ' + message });
  }
});
