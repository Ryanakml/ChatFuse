export type MessageSenderRole = 'user' | 'bot' | 'agent';

export type ConversationMessage = {
  id: string;
  conversationId: string;
  senderRole: MessageSenderRole;
  content: string;
  createdAt: string;
};

export type AgentDecisionEvent = {
  id: string;
  conversationId: string;
  eventType: 'intent_classification' | 'tool_call' | 'routing_decision' | 'error';
  details: Record<string, unknown>;
  createdAt: string;
};

export type ConversationTimelineItem =
  | ({ type: 'message' } & ConversationMessage)
  | ({ type: 'event' } & AgentDecisionEvent);

export type ConversationStatus = 'active' | 'escalated' | 'resolved';

export type EscalationStatus = 'open' | 'pending' | 'resolved';

export type ConversationSummary = {
  id: string;
  userId: string;
  status: ConversationStatus;
  lastMessageAt: string;
  createdAt: string;
  botActive: boolean;
  assignedTo?: string | null;
  escalationStatus?: EscalationStatus | null;
  slaBreachAt?: string | null;
};

export type OperatorTakeoverRequest = {
  conversationId: string;
  operatorId: string;
};

export type OperatorMessageRequest = {
  conversationId: string;
  content: string;
  operatorId: string; // auth.users ID
};

export type AssignOwnerRequest = {
  operatorId: string | null; // null to unassign
};

export type UpdateEscalationStatusRequest = {
  status: EscalationStatus;
};
