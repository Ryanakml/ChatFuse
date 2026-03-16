import type { ConversationSummary, ConversationTimelineItem, EscalationStatus } from '@wa-chat/shared';
export declare class ConversationRepository {
    listActiveConversations(): Promise<ConversationSummary[]>;
    listUnresolvedConversations(): Promise<ConversationSummary[]>;
    getConversationTimeline(conversationId: string): Promise<ConversationTimelineItem[]>;
    takeoverConversation(conversationId: string, operatorId: string): Promise<void>;
    returnToBot(conversationId: string, operatorId: string): Promise<void>;
    addOperatorMessage(conversationId: string, operatorId: string, content: string, whatsappMessageId?: string | null): Promise<void>;
    getConversationRecipientPhone(conversationId: string): Promise<string>;
    assignConversationOwner(conversationId: string, operatorId: string | null): Promise<void>;
    updateEscalationStatus(conversationId: string, status: EscalationStatus): Promise<void>;
}
export declare const conversationRepository: ConversationRepository;
//# sourceMappingURL=conversation.d.ts.map
