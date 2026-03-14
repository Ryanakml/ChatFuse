import { Router, type Response } from 'express';
import { authenticateRequest, requireRole } from '../auth.js';
import { conversationRepository } from '../repositories/conversation.js';
import { isDatabaseUnavailableError } from '../repositories/errors.js';

export const conversationsRouter = Router();

// Require support_agent or admin role to access these
conversationsRouter.use(authenticateRequest);
conversationsRouter.use(requireRole('support_agent')); // Admins also pass this check

const parsePositiveInteger = (value: unknown): number | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getErrorDetails = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const handleRepositoryError = (res: Response, error: unknown, fallbackMessage: string) => {
  if (isDatabaseUnavailableError(error)) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }
  res.status(500).json({ error: fallbackMessage, details: getErrorDetails(error) });
};

conversationsRouter.get('/', async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query['page']);
    const pageSize = parsePositiveInteger(req.query['pageSize']);
    const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;

    const list = await conversationRepository.listActiveConversations({
      ...(page !== undefined && { page }),
      ...(pageSize !== undefined && { pageSize }),
      ...(search !== undefined && { search }),
    });
    res.json(list);
  } catch (error) {
    handleRepositoryError(res, error, 'Failed to fetch conversations');
  }
});

conversationsRouter.get('/escalations', async (req, res) => {
  try {
    const list = await conversationRepository.listUnresolvedConversations();
    res.json(list);
  } catch (error) {
    console.error('Escalations error:', error);
    handleRepositoryError(res, error, 'Failed to fetch escalations');
  }
});

conversationsRouter.get('/:id/timeline', async (req, res) => {
  try {
    const conversationId = req.params.id;
    console.log('Timeline request received - ID:', conversationId);
    console.log('Is valid UUID:', isUuid(conversationId));
    if (!isUuid(conversationId)) {
      console.error('Invalid UUID format:', conversationId);
      res.status(400).json({ error: `Invalid conversation id: ${conversationId}` });
      return;
    }
    const timeline = await conversationRepository.getConversationTimeline(conversationId);
    console.log('Timeline fetched successfully, items:', timeline.length);
    res.json(timeline);
  } catch (error) {
    console.error('Timeline error:', error);
    handleRepositoryError(res, error, 'Failed to fetch timeline');
  }
});

conversationsRouter.post('/:id/takeover', async (req, res) => {
  try {
    // operatorId comes from the authenticated JWT token via authenticateRequest middleware
    const operatorId = req.user?.id || 'unknown';
    await conversationRepository.takeoverConversation(req.params.id, operatorId);
    res.json({ success: true });
  } catch (error) {
    console.error('Takeover error:', error);
    handleRepositoryError(res, error, 'Failed to take over conversation');
  }
});

conversationsRouter.post('/:id/return', async (req, res) => {
  try {
    const operatorId = req.user?.id || 'unknown';
    await conversationRepository.returnToBot(req.params.id, operatorId);
    res.json({ success: true });
  } catch (error) {
    handleRepositoryError(res, error, 'Failed to return conversation to bot');
  }
});

conversationsRouter.post('/:id/messages', async (req, res) => {
  try {
    const operatorId = req.user?.id || 'unknown';
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Message content required' });
      return;
    }
    await conversationRepository.addOperatorMessage(req.params.id, operatorId, content);

    // In a real app we would ALSO broadcast this out to WhatsApp here
    res.json({ success: true });
  } catch (error) {
    handleRepositoryError(res, error, 'Failed to send message');
  }
});

conversationsRouter.post('/:id/assign', async (req, res) => {
  try {
    const { operatorId } = req.body;
    await conversationRepository.assignConversationOwner(req.params.id, operatorId ?? null);
    res.json({ success: true });
  } catch (error) {
    handleRepositoryError(res, error, 'Failed to assign conversation');
  }
});

conversationsRouter.post('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'pending', 'resolved'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    await conversationRepository.updateEscalationStatus(req.params.id, status);
    res.json({ success: true });
  } catch (error) {
    handleRepositoryError(res, error, 'Failed to update conversation status');
  }
});
