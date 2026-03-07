import { BaseMessage } from '@langchain/core/messages';

export interface MessageContext {
  userId: string;
  conversationId: string;
  history: BaseMessage[];
}

export interface AgentState {
  originalInput: Record<string, unknown> | string;
  normalizedInput?: string;
  context?: MessageContext;
  intent?: 'RAG' | 'TOOL' | 'CLARIFICATION' | 'ESCALATION' | 'UNKNOWN';
  confidence?: number;
  route?: 'rag_path' | 'tool_path' | 'clarification_path' | 'escalation_path';
  composedResponse?: string;
  finalResponse?: string;
  isSafe?: boolean;
}
