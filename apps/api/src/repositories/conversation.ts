import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ConversationStatus,
  ConversationSummary,
  ConversationTimelineItem,
  EscalationStatus,
} from '@wa-chat/shared';
import { toRepositoryError } from './errors.js';

type ConversationRow = {
  id: string;
  user_id: string;
  status: string;
  started_at: string;
  assigned_to: string | null;
  escalation_status: EscalationStatus | null;
  sla_breach_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  sender_type: 'user' | 'agent' | 'system' | 'tool';
  body: string;
  created_at: string;
};

type AgentEventRow = {
  id: string;
  conversation_id: string;
  event_type: string;
  payload: unknown;
  created_at: string;
};

type ConversationListOptions = {
  page?: number;
  pageSize?: number;
  search?: string;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  _client = createClient(url, key);
  return _client;
}

/** Override the Supabase client — used in tests. */
export function setConversationClient(client: SupabaseClient): void {
  _client = client;
}

const normalizePage = (value: number | undefined) =>
  Number.isFinite(value) && value && value > 0 ? Math.floor(value) : DEFAULT_PAGE;

const normalizePageSize = (value: number | undefined) => {
  if (!Number.isFinite(value) || !value || value <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(value), MAX_PAGE_SIZE);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mapSenderRole = (
  direction: MessageRow['direction'],
  senderType: MessageRow['sender_type'],
): 'user' | 'bot' | 'agent' => {
  if (senderType === 'user' || direction === 'inbound') {
    return 'user';
  }
  if (senderType === 'agent') {
    return 'agent';
  }
  return 'bot';
};

const mapEventType = (
  eventType: string,
  payload: Record<string, unknown>,
): 'intent_classification' | 'tool_call' | 'routing_decision' | 'error' => {
  if (eventType === 'tool_call') {
    return 'tool_call';
  }

  if (eventType.includes('failure') || eventType.includes('error') || payload['error']) {
    return 'error';
  }

  if (payload['intent'] || payload['confidence'] !== undefined) {
    return 'intent_classification';
  }

  return 'routing_decision';
};

const mapConversationStatus = (
  status: string,
  escalationStatus: EscalationStatus | null,
): ConversationStatus => {
  if (escalationStatus === 'open' || escalationStatus === 'pending') {
    return 'escalated';
  }

  if (status === 'resolved' || escalationStatus === 'resolved') {
    return 'resolved';
  }

  return 'active';
};

const mapBotActive = (escalationStatus: EscalationStatus | null) =>
  escalationStatus !== 'open' && escalationStatus !== 'pending';

const compareByMostRecentMessage = (left: ConversationSummary, right: ConversationSummary) =>
  new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime();

const compareBySlaThenRecency = (left: ConversationSummary, right: ConversationSummary) => {
  const leftSla = left.slaBreachAt ? new Date(left.slaBreachAt).getTime() : Number.POSITIVE_INFINITY;
  const rightSla = right.slaBreachAt
    ? new Date(right.slaBreachAt).getTime()
    : Number.POSITIVE_INFINITY;

  if (leftSla !== rightSla) {
    return leftSla - rightSla;
  }

  return compareByMostRecentMessage(left, right);
};

const paginate = <T>(items: T[], page: number, pageSize: number) => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

export class ConversationRepository {
  private async findMatchingUserIds(search: string): Promise<string[]> {
    const client = getClient();
    const trimmed = search.trim();
    if (trimmed === '') {
      return [];
    }

    const pattern = `%${trimmed}%`;
    const { data, error } = await client
      .from('users')
      .select('id')
      .or(`phone_number.ilike.${pattern},display_name.ilike.${pattern}`);

    if (error) {
      throw toRepositoryError(error, 'search users for conversation list');
    }

    return (data ?? [])
      .map((row) => row.id as string | undefined)
      .filter((id): id is string => typeof id === 'string' && id !== '');
  }

  private async listConversationRows(input: {
    unresolvedOnly?: boolean;
    search?: string;
  }): Promise<ConversationRow[]> {
    const client = getClient();

    try {
      let userIds: string[] | null = null;
      if (input.search && input.search.trim() !== '') {
        userIds = await this.findMatchingUserIds(input.search);
        if (userIds.length === 0) {
          return [];
        }
      }

      let query = client
        .from('conversations')
        .select('id, user_id, status, started_at, assigned_to, escalation_status, sla_breach_at');

      if (input.unresolvedOnly) {
        query = query.in('escalation_status', ['open', 'pending']);
      }
      if (userIds) {
        query = query.in('user_id', userIds);
      }

      const { data, error } = await query;
      if (error) {
        throw toRepositoryError(error, 'list conversations');
      }

      return (data ?? []) as ConversationRow[];
    } catch (error: unknown) {
      throw toRepositoryError(error, 'list conversations');
    }
  }

  private async getLastMessageByConversation(conversationIds: string[]): Promise<Map<string, string>> {
    const latestMessageAt = new Map<string, string>();
    if (conversationIds.length === 0) {
      return latestMessageAt;
    }

    const client = getClient();

    const { data, error } = await client
      .from('messages')
      .select('conversation_id, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false });

    if (error) {
      throw toRepositoryError(error, 'load latest message timestamps');
    }

    for (const row of data ?? []) {
      const conversationId = row.conversation_id as string | undefined;
      const createdAt = row.created_at as string | undefined;
      if (!conversationId || !createdAt || latestMessageAt.has(conversationId)) {
        continue;
      }
      latestMessageAt.set(conversationId, createdAt);
    }

    return latestMessageAt;
  }

  private async mapConversationSummaries(rows: ConversationRow[]): Promise<ConversationSummary[]> {
    if (rows.length === 0) {
      return [];
    }

    const latestByConversation = await this.getLastMessageByConversation(rows.map((row) => row.id));

    return rows.map((row) => {
      const status = mapConversationStatus(row.status, row.escalation_status);
      return {
        id: row.id,
        userId: row.user_id,
        status,
        lastMessageAt: latestByConversation.get(row.id) ?? row.started_at,
        createdAt: row.started_at,
        botActive: mapBotActive(row.escalation_status),
        assignedTo: row.assigned_to,
        escalationStatus: row.escalation_status,
        slaBreachAt: row.sla_breach_at,
      };
    });
  }

  async listActiveConversations(options: ConversationListOptions = {}): Promise<ConversationSummary[]> {
    const page = normalizePage(options.page);
    const pageSize = normalizePageSize(options.pageSize);
    const rows = await this.listConversationRows({
      ...(options.search !== undefined && { search: options.search }),
    });
    const summaries = await this.mapConversationSummaries(rows);

    return paginate(summaries.sort(compareByMostRecentMessage), page, pageSize);
  }

  async listUnresolvedConversations(): Promise<ConversationSummary[]> {
    const rows = await this.listConversationRows({ unresolvedOnly: true });
    const summaries = await this.mapConversationSummaries(rows);
    return summaries.sort(compareBySlaThenRecency);
  }

  async getConversationTimeline(conversationId: string): Promise<ConversationTimelineItem[]> {
    const client = getClient();

    try {
      const messageQuery = client
        .from('messages')
        .select('id, conversation_id, direction, sender_type, body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      const eventQuery = client
        .from('agent_events')
        .select('id, conversation_id, event_type, payload, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      const [messageResult, eventResult] = await Promise.all([messageQuery, eventQuery]);

      if (messageResult.error) {
        throw toRepositoryError(messageResult.error, 'load conversation messages');
      }
      if (eventResult.error) {
        throw toRepositoryError(eventResult.error, 'load conversation events');
      }

      const messageItems: ConversationTimelineItem[] = ((messageResult.data ?? []) as MessageRow[]).map(
        (message) => ({
          type: 'message',
          id: message.id,
          conversationId: message.conversation_id,
          senderRole: mapSenderRole(message.direction, message.sender_type),
          content: message.body,
          createdAt: message.created_at,
        }),
      );

      const eventItems: ConversationTimelineItem[] = ((eventResult.data ?? []) as AgentEventRow[]).map(
        (event) => {
          const payload = isRecord(event.payload) ? event.payload : {};
          return {
            type: 'event',
            id: event.id,
            conversationId: event.conversation_id,
            eventType: mapEventType(event.event_type, payload),
            details: {
              sourceEventType: event.event_type,
              ...payload,
            },
            createdAt: event.created_at,
          };
        },
      );

      return [...messageItems, ...eventItems].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      );
    } catch (error: unknown) {
      throw toRepositoryError(error, 'load conversation timeline');
    }
  }

  async takeoverConversation(conversationId: string, operatorId: string): Promise<void> {
    const client = getClient();
    const nowIso = new Date().toISOString();

    try {
      const { error: updateError } = await client
        .from('conversations')
        .update({
          status: 'open',
          assigned_to: operatorId,
          escalation_status: 'open',
          updated_at: nowIso,
        })
        .eq('id', conversationId);

      if (updateError) {
        throw toRepositoryError(updateError, 'take over conversation');
      }

      const { error: eventError } = await client.from('agent_events').insert({
        conversation_id: conversationId,
        event_type: 'routing_decision',
        payload: { action: 'manual_takeover', operatorId },
        created_at: nowIso,
      });

      if (eventError) {
        throw toRepositoryError(eventError, 'write takeover event');
      }
    } catch (error: unknown) {
      throw toRepositoryError(error, 'take over conversation');
    }
  }

  async returnToBot(conversationId: string, operatorId: string): Promise<void> {
    const client = getClient();
    const nowIso = new Date().toISOString();

    try {
      const { error: updateError } = await client
        .from('conversations')
        .update({
          status: 'open',
          assigned_to: null,
          escalation_status: 'resolved',
          updated_at: nowIso,
        })
        .eq('id', conversationId);

      if (updateError) {
        throw toRepositoryError(updateError, 'return conversation to bot');
      }

      const { error: eventError } = await client.from('agent_events').insert({
        conversation_id: conversationId,
        event_type: 'routing_decision',
        payload: { action: 'return_to_bot', operatorId },
        created_at: nowIso,
      });

      if (eventError) {
        throw toRepositoryError(eventError, 'write return-to-bot event');
      }
    } catch (error: unknown) {
      throw toRepositoryError(error, 'return conversation to bot');
    }
  }

  async addOperatorMessage(
    conversationId: string,
    _operatorId: string,
    content: string,
  ): Promise<void> {
    const client = getClient();

    try {
      const { error } = await client.from('messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        sender_type: 'agent',
        body: content,
      });

      if (error) {
        throw toRepositoryError(error, 'insert operator message');
      }
    } catch (error: unknown) {
      throw toRepositoryError(error, 'insert operator message');
    }
  }

  async assignConversationOwner(conversationId: string, operatorId: string | null): Promise<void> {
    const client = getClient();

    try {
      const { error } = await client
        .from('conversations')
        .update({
          assigned_to: operatorId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (error) {
        throw toRepositoryError(error, 'assign conversation owner');
      }
    } catch (error: unknown) {
      throw toRepositoryError(error, 'assign conversation owner');
    }
  }

  async updateEscalationStatus(conversationId: string, status: EscalationStatus): Promise<void> {
    const client = getClient();
    const nextConversationStatus = status === 'resolved' ? 'resolved' : 'open';

    try {
      const { error } = await client
        .from('conversations')
        .update({
          status: nextConversationStatus,
          escalation_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (error) {
        throw toRepositoryError(error, 'update escalation status');
      }
    } catch (error: unknown) {
      throw toRepositoryError(error, 'update escalation status');
    }
  }
}

export const conversationRepository = new ConversationRepository();
