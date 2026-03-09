import { describe, it, expect, beforeEach } from 'vitest';
import { logAuditEvent, getAuditEvents, setAuditClient, type AuditEvent } from './audit.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---- In-memory audit store ----
const auditStore: AuditEvent[] = [];

const makeSelectChain = (filterFn: (e: AuditEvent) => boolean = () => true) => ({
  order: () => ({
    limit: () => ({ data: auditStore.filter(filterFn), error: null }),
    data: auditStore.filter(filterFn),
    error: null,
  }),
  eq: (field: string, value: string) =>
    makeSelectChain((e) => (e as unknown as Record<string, unknown>)[field] === value),
  range: () => makeSelectChain(filterFn),
  data: auditStore.filter(filterFn),
  error: null,
});

const mockFrom = (table: string) => {
  if (table !== 'audit_events') {
    return {
      insert: () => ({
        select: () => ({ single: () => ({ data: null, error: { message: 'wrong table' } }) }),
      }),
    };
  }
  return {
    insert: (row: AuditEvent) => {
      const stored: AuditEvent = {
        id: `mock-${auditStore.length + 1}`,
        ...row,
        created_at: new Date().toISOString(),
      };
      auditStore.push(stored);
      return { select: () => ({ single: () => ({ data: stored, error: null }) }) };
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    select: (_sel: string) => makeSelectChain(),
  };
};

// Cast via unknown to avoid exact type match requirement on SupabaseClient
const mockClient = { from: (t: string) => mockFrom(t) } as unknown as SupabaseClient;

beforeEach(() => {
  auditStore.length = 0;
  setAuditClient(mockClient);
});

describe('logAuditEvent', () => {
  it('inserts an audit record and returns it', async () => {
    const event: AuditEvent = {
      actor_id: 'user-abc',
      actor_role: 'admin',
      action: 'user.data_deleted',
      resource_type: 'user',
      resource_id: 'user-123',
      metadata: { deleted_messages: 5 },
    };

    const result = await logAuditEvent(event);
    expect(result.id).toBeDefined();
    expect(result.action).toBe('user.data_deleted');
    expect(result.actor_id).toBe('user-abc');
    expect(result.resource_id).toBe('user-123');
  });

  it('stores the record persistently', async () => {
    await logAuditEvent({
      actor_id: 'op-1',
      actor_role: 'support_agent',
      action: 'admin.login',
      resource_type: 'session',
    });
    expect(auditStore).toHaveLength(1);
    expect(auditStore[0]!.action).toBe('admin.login');
  });
});

describe('getAuditEvents', () => {
  beforeEach(async () => {
    await logAuditEvent({
      actor_id: 'op-1',
      actor_role: 'admin',
      action: 'user.data_deleted',
      resource_type: 'user',
    });
    await logAuditEvent({
      actor_id: 'op-2',
      actor_role: 'admin',
      action: 'admin.login',
      resource_type: 'session',
    });
  });

  it('returns all stored events with no filters', async () => {
    const events = await getAuditEvents();
    expect(events.length).toBeGreaterThanOrEqual(2);
  });
});
