/**
 * Audit Repository
 *
 * Provides typed access to the `audit_events` table.
 * All writes go through `logAuditEvent` which enforces
 * the insert-only contract; no update/delete exposed.
 */
import { type SupabaseClient } from '@supabase/supabase-js';
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
/** Override the Supabase client — used in tests. */
export declare function setAuditClient(client: SupabaseClient): void;
/**
 * Insert an audit event record.
 * Throws on database error to ensure callers surface audit write failures.
 */
export declare function logAuditEvent(event: AuditEvent): Promise<AuditEvent>;
/**
 * Query audit events with optional filters.
 * Returns paginated results (default limit 50).
 */
export declare function getAuditEvents(filters?: AuditQueryFilters): Promise<AuditEvent[]>;
//# sourceMappingURL=audit.d.ts.map