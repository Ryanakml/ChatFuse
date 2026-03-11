import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

let _client: SupabaseClient | null = null;

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

  const { data, error } = await client
    .from('users')
    .upsert(
      {
        phone_number: input.phoneNumber,
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
