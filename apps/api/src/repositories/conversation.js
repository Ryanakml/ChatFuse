// In-memory mock for now to satisfy J2 until DB is fully wired for conversations
// In a real scenario, this fetches from Supabase
const mockConversations = [
    {
        id: 'conv_1',
        userId: 'user_123',
        status: 'active',
        lastMessageAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        botActive: true,
    },
    {
        id: 'conv_2',
        userId: 'user_456',
        status: 'escalated',
        lastMessageAt: new Date(Date.now() - 3600000).toISOString(),
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        botActive: false,
        escalationStatus: 'open',
        slaBreachAt: new Date(Date.now() + 7200000).toISOString(), // Breach in 2 hours
    },
    {
        id: 'conv_3',
        userId: 'user_789',
        status: 'escalated',
        lastMessageAt: new Date(Date.now() - 7200000).toISOString(),
        createdAt: new Date(Date.now() - 259200000).toISOString(),
        botActive: false,
        escalationStatus: 'pending',
        assignedTo: 'some-operator-id',
        slaBreachAt: new Date(Date.now() - 3600000).toISOString(), // Breached 1 hour ago
    },
];
const mockTimeline = {
    conv_1: [
        {
            type: 'message',
            id: 'msg_1',
            conversationId: 'conv_1',
            senderRole: 'user',
            content: 'Where is my order?',
            createdAt: new Date(Date.now() - 60000).toISOString(),
        },
        {
            type: 'event',
            id: 'evt_1',
            conversationId: 'conv_1',
            eventType: 'intent_classification',
            details: { intent: 'order_status', confidence: 0.95 },
            createdAt: new Date(Date.now() - 58000).toISOString(),
        },
        {
            type: 'event',
            id: 'evt_2',
            conversationId: 'conv_1',
            eventType: 'tool_call',
            details: { tool: 'lookupOrder', input: { userId: 'user_123' }, status: 'success' },
            createdAt: new Date(Date.now() - 55000).toISOString(),
        },
        {
            type: 'message',
            id: 'msg_2',
            conversationId: 'conv_1',
            senderRole: 'bot',
            content: 'Your order is arriving tomorrow.',
            createdAt: new Date(Date.now() - 50000).toISOString(),
        },
    ],
    conv_2: [
        {
            type: 'message',
            id: 'msg_3',
            conversationId: 'conv_2',
            senderRole: 'user',
            content: 'I need to talk to a human right now! This is ridiculous.',
            createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
            type: 'event',
            id: 'evt_3',
            conversationId: 'conv_2',
            eventType: 'routing_decision',
            details: { reason: 'sentiment_negative', action: 'escalate' },
            createdAt: new Date(Date.now() - 3595000).toISOString(),
        },
    ],
};
export class ConversationRepository {
    async listActiveConversations() {
        return mockConversations;
    }
    async listUnresolvedConversations() {
        return mockConversations
            .filter((c) => c.escalationStatus === 'open' || c.escalationStatus === 'pending')
            .sort((a, b) => {
            const timeA = a.slaBreachAt ? new Date(a.slaBreachAt).getTime() : Infinity;
            const timeB = b.slaBreachAt ? new Date(b.slaBreachAt).getTime() : Infinity;
            return timeA - timeB;
        });
    }
    async getConversationTimeline(conversationId) {
        return mockTimeline[conversationId] || [];
    }
    async takeoverConversation(conversationId, operatorId) {
        const conv = mockConversations.find((c) => c.id === conversationId);
        if (conv) {
            conv.botActive = false;
            // Also log takeover event
            if (!mockTimeline[conversationId])
                mockTimeline[conversationId] = [];
            mockTimeline[conversationId].push({
                type: 'event',
                id: `evt_takeover_${Date.now()}`,
                conversationId,
                eventType: 'routing_decision',
                details: { action: 'manual_takeover', operatorId },
                createdAt: new Date().toISOString(),
            });
        }
    }
    async returnToBot(conversationId, operatorId) {
        const conv = mockConversations.find((c) => c.id === conversationId);
        if (conv) {
            conv.botActive = true;
            if (!mockTimeline[conversationId])
                mockTimeline[conversationId] = [];
            mockTimeline[conversationId].push({
                type: 'event',
                id: `evt_return_${Date.now()}`,
                conversationId,
                eventType: 'routing_decision',
                details: { action: 'return_to_bot', operatorId },
                createdAt: new Date().toISOString(),
            });
        }
    }
    async addOperatorMessage(conversationId, operatorId, content) {
        if (!mockTimeline[conversationId])
            mockTimeline[conversationId] = [];
        mockTimeline[conversationId].push({
            type: 'message',
            id: `msg_op_${Date.now()}`,
            conversationId,
            senderRole: 'agent',
            content,
            createdAt: new Date().toISOString(),
        });
    }
    async assignConversationOwner(conversationId, operatorId) {
        const conv = mockConversations.find((c) => c.id === conversationId);
        if (conv && conv.status === 'escalated') {
            conv.assignedTo = operatorId;
        }
    }
    async updateEscalationStatus(conversationId, status) {
        const conv = mockConversations.find((c) => c.id === conversationId);
        if (conv && conv.status === 'escalated') {
            conv.escalationStatus = status;
            if (status === 'resolved') {
                conv.status = 'resolved';
            }
        }
    }
}
export const conversationRepository = new ConversationRepository();
//# sourceMappingURL=conversation.js.map