import { Router } from 'express';
import { authenticateRequest, requireRole } from '../auth.js';
import { conversationRepository } from '../repositories/conversation.js';
import { sendWhatsAppTextMessage } from '../services/whatsapp.js';
export const conversationsRouter = Router();
// Require support_agent or admin role to access these
conversationsRouter.use(authenticateRequest);
conversationsRouter.use(requireRole('support_agent')); // Admins also pass this check
conversationsRouter.get('/', async (req, res) => {
    try {
        const list = await conversationRepository.listActiveConversations();
        res.json(list);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});
conversationsRouter.get('/escalations', async (req, res) => {
    try {
        const list = await conversationRepository.listUnresolvedConversations();
        res.json(list);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch escalations' });
    }
});
conversationsRouter.get('/:id/timeline', async (req, res) => {
    try {
        const timeline = await conversationRepository.getConversationTimeline(req.params.id);
        res.json(timeline);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch timeline' });
    }
});
conversationsRouter.post('/:id/takeover', async (req, res) => {
    try {
        // Note: in a real app, operatorId comes from the authenticated x-wa-user header
        const operatorId = req.header('x-wa-user') || 'unknown';
        await conversationRepository.takeoverConversation(req.params.id, operatorId);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to take over conversation',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
conversationsRouter.post('/:id/return', async (req, res) => {
    try {
        const operatorId = req.header('x-wa-user') || 'unknown';
        await conversationRepository.returnToBot(req.params.id, operatorId);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to return conversation to bot',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
conversationsRouter.post('/:id/messages', async (req, res) => {
    try {
        const operatorId = req.user?.id || 'unknown';
        const contentRaw = req.body?.content;
        const content = typeof contentRaw === 'string' ? contentRaw.trim() : '';
        if (!content) {
            res.status(400).json({ error: 'Message content required' });
            return;
        }
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        if (!phoneNumberId || !accessToken) {
            res.status(500).json({ error: 'WhatsApp outbound is not configured' });
            return;
        }
        const recipientPhone = await conversationRepository.getConversationRecipientPhone(req.params.id);
        const outboundResult = await sendWhatsAppTextMessage({
            phoneNumberId,
            accessToken,
            to: recipientPhone,
            text: content,
        });
        try {
            await conversationRepository.addOperatorMessage(req.params.id, operatorId, content, outboundResult.messageId);
        }
        catch (persistError) {
            console.error('Manual outbound sent but failed to persist message:', persistError);
            res.json({
                success: true,
                messageId: outboundResult.messageId,
                persisted: false,
            });
            return;
        }
        res.json({ success: true, messageId: outboundResult.messageId, persisted: true });
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to send message',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
conversationsRouter.post('/:id/assign', async (req, res) => {
    try {
        const { operatorId } = req.body;
        await conversationRepository.assignConversationOwner(req.params.id, operatorId ?? null);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to assign conversation',
            details: error instanceof Error ? error.message : String(error),
        });
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
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to update conversation status',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
//# sourceMappingURL=conversations.js.map
