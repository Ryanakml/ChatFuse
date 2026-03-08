import { Router } from 'express';
import { authenticateRequest, requireRole } from '../auth.js';
import { conversationRepository } from '../repositories/conversation.js';

export const conversationsRouter = Router();

// Require support_agent or admin role to access these
conversationsRouter.use(authenticateRequest);
conversationsRouter.use(requireRole('support_agent')); // Admins also pass this check

conversationsRouter.get('/', async (req, res) => {
  try {
    const list = await conversationRepository.listActiveConversations();
    res.json(list);
  } catch {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

conversationsRouter.get('/escalations', async (req, res) => {
  try {
    const list = await conversationRepository.listUnresolvedConversations();
    res.json(list);
  } catch {
    res.status(500).json({ error: 'Failed to fetch escalations' });
  }
});

conversationsRouter.get('/:id/timeline', async (req, res) => {
  try {
    const timeline = await conversationRepository.getConversationTimeline(req.params.id);
    res.json(timeline);
  } catch {
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

conversationsRouter.post('/:id/takeover', async (req, res) => {
  try {
    // Note: in a real app, operatorId comes from the authenticated x-wa-user header
    const operatorId = req.header('x-wa-user') || 'unknown';
    await conversationRepository.takeoverConversation(req.params.id, operatorId);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to take over conversation' });
  }
});

conversationsRouter.post('/:id/return', async (req, res) => {
  try {
    const operatorId = req.header('x-wa-user') || 'unknown';
    await conversationRepository.returnToBot(req.params.id, operatorId);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to return conversation to bot' });
  }
});

conversationsRouter.post('/:id/messages', async (req, res) => {
  try {
    const operatorId = req.header('x-wa-user') || 'unknown';
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Message content required' });
      return;
    }
    await conversationRepository.addOperatorMessage(req.params.id, operatorId, content);

    // In a real app we would ALSO broadcast this out to WhatsApp here
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

conversationsRouter.post('/:id/assign', async (req, res) => {
  try {
    const { operatorId } = req.body;
    await conversationRepository.assignConversationOwner(req.params.id, operatorId ?? null);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to assign conversation' });
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
  } catch {
    res.status(500).json({ error: 'Failed to update conversation status' });
  }
});
