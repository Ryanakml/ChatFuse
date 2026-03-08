import type { ConversationSummary, ConversationTimelineItem } from '@wa-chat/shared';
export declare class ConversationRepository {
    listActiveConversations(): Promise<ConversationSummary[]>;
    getConversationTimeline(conversationId: string): Promise<ConversationTimelineItem[]>;
    takeoverConversation(conversationId: string, operatorId: string): Promise<void>;
    returnToBot(conversationId: string, operatorId: string): Promise<void>;
    addOperatorMessage(conversationId: string, operatorId: string, content: string): Promise<void>;
}
export declare const conversationRepository: ConversationRepository;
//# sourceMappingURL=conversation.d.ts.map