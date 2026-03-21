import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { conversationRepository, setConversationClient } from './conversation.ts';

type UserRow = { id: string; phone_number: string; display_name: string | null };
type ConversationRow = {
  id: string;
  user_id: string;
  status: string;
  started_at: string;
  assigned_to: string | null;
  escalation_status: 'open' | 'pending' | 'resolved' | null;
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
  payload: Record<string, unknown>;
  created_at: string;
};

const users: UserRow[] = [
  { id: 'user-1', phone_number: '628111111111', display_name: 'Alice' },
  { id: 'user-2', phone_number: '628222222222', display_name: 'Budi' },
];

const conversations: ConversationRow[] = [
  {
    id: 'conv-a',
    user_id: 'user-1',
    status: 'open',
    started_at: '2026-03-01T00:00:00.000Z',
    assigned_to: null,
    escalation_status: null,
    sla_breach_at: null,
  },
  {
    id: 'conv-b',
    user_id: 'user-2',
    status: 'open',
    started_at: '2026-03-02T00:00:00.000Z',
    assigned_to: 'op-1',
    escalation_status: 'open',
    sla_breach_at: '2026-03-12T10:00:00.000Z',
  },
  {
    id: 'conv-c',
    user_id: 'user-2',
    status: 'resolved',
    started_at: '2026-03-03T00:00:00.000Z',
    assigned_to: null,
    escalation_status: 'resolved',
    sla_breach_at: null,
  },
];

const messages: MessageRow[] = [
  {
    id: 'msg-1',
    conversation_id: 'conv-a',
    direction: 'inbound',
    sender_type: 'user',
    body: 'Hi',
    created_at: '2026-03-12T08:00:00.000Z',
  },
  {
    id: 'msg-2',
    conversation_id: 'conv-a',
    direction: 'outbound',
    sender_type: 'agent',
    body: 'Hello',
    created_at: '2026-03-12T08:01:00.000Z',
  },
  {
    id: 'msg-3',
    conversation_id: 'conv-b',
    direction: 'inbound',
    sender_type: 'user',
    body: 'Need help',
    created_at: '2026-03-12T09:00:00.000Z',
  },
];

const events: AgentEventRow[] = [
  {
    id: 'evt-1',
    conversation_id: 'conv-a',
    event_type: 'pipeline_success',
    payload: { intent: 'RAG', confidence: 0.9, route: 'rag_path' },
    created_at: '2026-03-12T08:00:30.000Z',
  },
  {
    id: 'evt-2',
    conversation_id: 'conv-a',
    event_type: 'tool_call',
    payload: { toolName: 'order_status_lookup' },
    created_at: '2026-03-12T08:01:30.000Z',
  },
];

const makeMockClient = () => {
  const from = (table: string) => {
    if (table === 'users') {
      return {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        select: (_columns: string) => ({
          or: (expression: string) => {
            const termMatch = expression.match(/ilike\.%([^%]+)%/);
            const term = termMatch?.[1]?.toLowerCase() ?? '';
            const data = users
              .filter(
                (user) =>
                  user.phone_number.toLowerCase().includes(term) ||
                  (user.display_name ?? '').toLowerCase().includes(term),
              )
              .map((user) => ({ id: user.id }));
            return Promise.resolve({ data, error: null });
          },
        }),
      };
    }

    if (table === 'conversations') {
      return {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        select: (_columns: string) => {
          const filter = {
            escalationStatus: null as string[] | null,
            userIds: null as string[] | null,
          };

          const query: {
            in: (column: string, values: string[]) => typeof query;
            then: (resolve: (value: { data: ConversationRow[]; error: null }) => unknown) => unknown;
          } = {
            in: (column, values) => {
              if (column === 'escalation_status') {
                filter.escalationStatus = values;
              }
              if (column === 'user_id') {
                filter.userIds = values;
              }
              return query;
            },
            then: (resolve) => {
              let data = [...conversations];
              if (filter.escalationStatus) {
                data = data.filter(
                  (row) =>
                    row.escalation_status !== null &&
                    filter.escalationStatus !== null &&
                    filter.escalationStatus.includes(row.escalation_status),
                );
              }
              if (filter.userIds) {
                data = data.filter((row) => filter.userIds?.includes(row.user_id));
              }
              return resolve({ data, error: null });
            },
          };

          return query;
        },
      };
    }

    if (table === 'messages') {
      return {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        select: (_columns: string) => {
          const filter = {
            conversationIds: null as string[] | null,
            conversationId: null as string | null,
            sortAscending: true,
          };

          const query: {
            in: (column: string, values: string[]) => typeof query;
            eq: (column: string, value: string) => typeof query;
            order: (column: string, options: { ascending: boolean }) => typeof query;
            then: (resolve: (value: { data: MessageRow[]; error: null }) => unknown) => unknown;
          } = {
            in: (column, values) => {
              if (column === 'conversation_id') {
                filter.conversationIds = values;
              }
              return query;
            },
            eq: (column, value) => {
              if (column === 'conversation_id') {
                filter.conversationId = value;
              }
              return query;
            },
            order: (_column, options) => {
              filter.sortAscending = options.ascending;
              return query;
            },
            then: (resolve) => {
              let data = [...messages];
              if (filter.conversationIds) {
                data = data.filter((row) => filter.conversationIds?.includes(row.conversation_id));
              }
              if (filter.conversationId) {
                data = data.filter((row) => row.conversation_id === filter.conversationId);
              }
              data.sort((left, right) => {
                const direction = filter.sortAscending ? 1 : -1;
                return (
                  direction *
                  (new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
                );
              });
              return resolve({ data, error: null });
            },
          };

          return query;
        },
      };
    }

    if (table === 'agent_events') {
      return {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        select: (_columns: string) => {
          const filter = {
            conversationId: null as string | null,
          };

          const query: {
            eq: (column: string, value: string) => typeof query;
            order: (column: string, options: { ascending: boolean }) => typeof query;
            then: (resolve: (value: { data: AgentEventRow[]; error: null }) => unknown) => unknown;
          } = {
            eq: (column, value) => {
              if (column === 'conversation_id') {
                filter.conversationId = value;
              }
              return query;
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            order: (_column, _options) => query,
            then: (resolve) => {
              const data = events.filter((row) => row.conversation_id === filter.conversationId);
              return resolve({ data, error: null });
            },
          };

          return query;
        },
      };
    }

    return {
      select: () => ({
        then: (resolve: (value: { data: []; error: null }) => unknown) =>
          resolve({ data: [], error: null }),
      }),
    };
  };

  return { from } as unknown as SupabaseClient;
};

beforeEach(() => {
  setConversationClient(makeMockClient());
});

describe('ConversationRepository', () => {
  it('lists conversations sorted by latest message timestamp', async () => {
    const list = await conversationRepository.listActiveConversations();
    expect(list.map((row) => row.id)).toEqual(['conv-b', 'conv-a', 'conv-c']);
    expect(list[0]?.status).toBe('escalated');
  });

  it('filters conversation list by waId search', async () => {
    const list = await conversationRepository.listActiveConversations({ search: '628111' });
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('conv-a');
  });

  it('lists unresolved escalations only', async () => {
    const list = await conversationRepository.listUnresolvedConversations();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('conv-b');
    expect(list[0]?.escalationStatus).toBe('open');
  });

  it('returns a merged timeline with messages and events', async () => {
    const timeline = await conversationRepository.getConversationTimeline('conv-a');
    expect(timeline).toHaveLength(4);
    expect(timeline[0]?.type).toBe('message');
    expect(timeline[1]?.type).toBe('event');
    if (timeline[1]?.type !== 'event') {
      throw new Error('Expected timeline item to be an event');
    }
    expect(timeline[1].eventType).toBe('routing_decision');
  });
});
