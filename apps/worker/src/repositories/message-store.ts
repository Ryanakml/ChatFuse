import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeIndonesianPhoneNumber } from '@wa-chat/shared';

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

let _client: SupabaseClient | null = null;

export type RecentMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  createdAt: string | null;
};

export type ConversationEscalationStatus = 'open' | 'pending' | 'resolved' | null;

const toJsonValue = (value: unknown): JsonValue => {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      toJsonValue(nestedValue),
    ]);

    return Object.fromEntries(entries) as JsonObject;
  }

  return String(value);
};

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  _client = createClient(url, key);
  return _client;
}

export function setMessageStoreClient(client: SupabaseClient): void {
  _client = client;
}

export async function upsertUser(input: {
  phoneNumber: string;
  displayName?: string;
}): Promise<string> {
  const client = getClient();
  const normalizedPhone = normalizeIndonesianPhoneNumber(input.phoneNumber) ?? input.phoneNumber.trim();

  const { data, error } = await client
    .from('users')
    .upsert(
      {
        phone_number: normalizedPhone,
        display_name: input.displayName ?? null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'phone_number',
      },
    )
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(`upsertUser failed: ${error?.message ?? 'missing user id'}`);
  }

  return data.id as string;
}

export async function upsertConversation(input: { userId: string }): Promise<string> {
  const client = getClient();

  const { data: existingConversation, error: selectError } = await client
    .from('conversations')
    .select('id')
    .eq('user_id', input.userId)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`upsertConversation select failed: ${selectError.message}`);
  }

  if (existingConversation?.id) {
    return existingConversation.id as string;
  }

  const { data: insertedConversation, error: insertError } = await client
    .from('conversations')
    .insert({
      user_id: input.userId,
      status: 'open',
    })
    .select('id')
    .single();

  if (insertError || !insertedConversation?.id) {
    throw new Error(`upsertConversation insert failed: ${insertError?.message ?? 'missing id'}`);
  }

  return insertedConversation.id as string;
}

export async function insertInboundMessage(input: {
  conversationId: string;
  whatsappMessageId: string;
  body: string;
  timestamp: string;
}): Promise<string | null> {
  const client = getClient();

  const { data, error } = await client
    .from('messages')
    .insert({
      conversation_id: input.conversationId,
      direction: 'inbound',
      sender_type: 'user',
      whatsapp_message_id: input.whatsappMessageId,
      body: input.body,
      created_at: input.timestamp,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return null;
    }

    throw new Error(`insertInboundMessage failed: ${error.message}`);
  }

  return (data?.id as string | undefined) ?? null;
}

export async function getConversationEscalationStatus(
  conversationId: string,
): Promise<ConversationEscalationStatus> {
  const client = getClient();

  const { data, error } = await client
    .from('conversations')
    .select('escalation_status')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    throw new Error(`getConversationEscalationStatus failed: ${error.message}`);
  }

  const escalationStatus = data?.escalation_status as ConversationEscalationStatus | undefined;
  return escalationStatus ?? null;
}

export async function markConversationEscalated(conversationId: string): Promise<void> {
  const client = getClient();

  const { error } = await client
    .from('conversations')
    .update({
      status: 'open',
      escalation_status: 'open',
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  if (error) {
    throw new Error(`markConversationEscalated failed: ${error.message}`);
  }
}

export async function insertOutboundMessage(input: {
  conversationId: string;
  whatsappMessageId: string;
  body: string;
}): Promise<string | null> {
  const client = getClient();

  const { data, error } = await client
    .from('messages')
    .insert({
      conversation_id: input.conversationId,
      direction: 'outbound',
      sender_type: 'agent',
      whatsapp_message_id: input.whatsappMessageId,
      body: input.body,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return null;
    }

    throw new Error(`insertOutboundMessage failed: ${error.message}`);
  }

  return (data?.id as string | undefined) ?? null;
}

export async function insertAgentEvent(input: {
  conversationId: string;
  messageId?: string | null;
  eventType: string;
  payload: JsonObject;
}): Promise<void> {
  const client = getClient();

  const { error } = await client.from('agent_events').insert({
    conversation_id: input.conversationId,
    message_id: input.messageId ?? null,
    event_type: input.eventType,
    payload: input.payload,
  });

  if (error) {
    throw new Error(`insertAgentEvent failed: ${error.message}`);
  }
}

export async function insertToolCall(input: {
  conversationId: string;
  messageId?: string | null;
  toolName: string;
  input: unknown;
  output: unknown;
  status: 'success' | 'failure';
}): Promise<void> {
  const client = getClient();

  const { error } = await client.from('tool_calls').insert({
    conversation_id: input.conversationId,
    message_id: input.messageId ?? null,
    tool_name: input.toolName,
    input: toJsonValue(input.input),
    output: toJsonValue(input.output),
    status: input.status,
  });

  if (error) {
    throw new Error(`insertToolCall failed: ${error.message}`);
  }
}

export async function getRecentMessages(
  conversationId: string,
  options?: { limit?: number },
): Promise<RecentMessage[]> {
  const client = getClient();
  const limit = options?.limit ?? 10;

  const { data, error } = await client
    .from('messages')
    .select('id, direction, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getRecentMessages failed: ${error.message}`);
  }

  const rows = (data ?? []).map((row) => ({
    id: row.id as string,
    direction: row.direction as 'inbound' | 'outbound',
    body: row.body as string,
    createdAt: (row.created_at as string | null) ?? null,
  }));

  return rows.reverse();
}
