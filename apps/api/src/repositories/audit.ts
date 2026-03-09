/**
 * Audit Repository
 *
 * Provides typed access to the `audit_events` table.
 * All writes go through `logAuditEvent` which enforces
 * the insert-only contract; no update/delete exposed.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface AuditEvent {
  id?: string;
  actor_id: string;
  actor_role: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface AuditQueryFilters {
  action?: string;
  actor_id?: string;
  resource_type?: string;
  limit?: number;
  offset?: number;
}

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  _client = createClient(url, key);
  return _client;
}

/** Override the Supabase client — used in tests. */
export function setAuditClient(client: SupabaseClient): void {
  _client = client;
}

/**
 * Insert an audit event record.
 * Throws on database error to ensure callers surface audit write failures.
 */
export async function logAuditEvent(event: AuditEvent): Promise<AuditEvent> {
  const client = getClient();
  const { data, error } = await client
    .from('audit_events')
    .insert({
      actor_id: event.actor_id,
      actor_role: event.actor_role,
      action: event.action,
      resource_type: event.resource_type,
      resource_id: event.resource_id ?? null,
      metadata: event.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`logAuditEvent failed: ${error.message}`);
  }

  return data as AuditEvent;
}

/**
 * Query audit events with optional filters.
 * Returns paginated results (default limit 50).
 */
export async function getAuditEvents(filters: AuditQueryFilters = {}): Promise<AuditEvent[]> {
  const client = getClient();
  let query = client
    .from('audit_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);
  }
  if (filters.action) {
    query = query.eq('action', filters.action);
  }
  if (filters.actor_id) {
    query = query.eq('actor_id', filters.actor_id);
  }
  if (filters.resource_type) {
    query = query.eq('resource_type', filters.resource_type);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`getAuditEvents failed: ${error.message}`);
  }

  return (data ?? []) as AuditEvent[];
}
