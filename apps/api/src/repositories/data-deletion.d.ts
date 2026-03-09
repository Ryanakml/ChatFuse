/**
 * Data Deletion Repository
 *
 * Implements GDPR-compliant user data deletion by calling the
 * `delete_user_data` SQL function defined in migration
 * `202603090100_l1_audit_data_deletion.sql`.
 *
 * The SQL function performs a cascading hard delete and writes
 * an immutable audit record in a single transaction.
 */
import { type SupabaseClient } from '@supabase/supabase-js';
export interface DataDeletionResult {
    success: boolean;
    deleted_users: number;
    deleted_conversations: number;
    deleted_messages: number;
    deleted_agent_events: number;
    deleted_tool_calls: number;
    deleted_tickets: number;
}
/** Override the Supabase client — used in tests. */
export declare function setDataDeletionClient(client: SupabaseClient): void;
/**
 * Hard-delete all data for a user by UUID.
 * Delegates to the `delete_user_data` SQL function.
 * @throws if user not found or DB returns error.
 */
export declare function deleteUserData(userId: string, actorId?: string, actorRole?: string): Promise<DataDeletionResult>;
/**
 * Resolve a user by phone number, then call deleteUserData.
 * @throws if phone number not found.
 */
export declare function deleteUserDataByPhone(phoneNumber: string, actorId?: string, actorRole?: string): Promise<DataDeletionResult>;
//# sourceMappingURL=data-deletion.d.ts.map