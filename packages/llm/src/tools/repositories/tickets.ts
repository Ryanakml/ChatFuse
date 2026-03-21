import { getToolsSupabaseClient } from './client.js';

type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface CreateSupportTicketInput {
  conversationId: string;
  category: string;
  priority: string;
  issueDescription: string;
  customerPhone?: string;
  idempotencyKey?: string;
}

export interface Ticket {
  id: string;
  conversation_id: string;
  external_ticket_id: string | null;
  status: 'open' | 'pending' | 'closed' | 'escalated';
  priority: TicketPriority;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const normalizePriority = (priority: string): TicketPriority => {
  const normalized = priority.trim().toLowerCase();

  if (normalized === 'medium') {
    return 'normal';
  }

  if (normalized === 'low' || normalized === 'normal' || normalized === 'high' || normalized === 'urgent') {
    return normalized;
  }

  return 'normal';
};

export async function createSupportTicket(input: CreateSupportTicketInput): Promise<Ticket> {
  const supabaseClient = getToolsSupabaseClient();

  if (input.idempotencyKey) {
    const { data: existing, error: selectError } = await supabaseClient
      .from('tickets')
      .select(
        `
        id,
        conversation_id,
        external_ticket_id,
        status,
        priority,
        metadata,
        created_at,
        updated_at
        `,
      )
      .eq('conversation_id', input.conversationId)
      .contains('metadata', { idempotencyKey: input.idempotencyKey })
      .limit(1)
      .maybeSingle<Ticket>();

    if (selectError) {
      throw new Error(`Failed to check existing support ticket: ${selectError.message}`);
    }

    if (existing) {
      return existing;
    }
  }

  const metadata = {
    category: input.category,
    issueDescription: input.issueDescription,
    customerPhone: input.customerPhone ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  };

  const { data, error } = await supabaseClient
    .from('tickets')
    .insert({
      conversation_id: input.conversationId,
      status: 'open',
      priority: normalizePriority(input.priority),
      metadata,
    })
    .select(
      `
      id,
      conversation_id,
      external_ticket_id,
      status,
      priority,
      metadata,
      created_at,
      updated_at
      `,
    )
    .single<Ticket>();

  if (error) {
    throw new Error(`Failed to create support ticket: ${error.message}`);
  }

  return data;
}
