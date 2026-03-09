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
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface DataDeletionResult {
  success: boolean;
  deleted_users: number;
  deleted_conversations: number;
  deleted_messages: number;
  deleted_agent_events: number;
  deleted_tool_calls: number;
  deleted_tickets: number;
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
export function setDataDeletionClient(client: SupabaseClient): void {
  _client = client;
}

/**
 * Hard-delete all data for a user by UUID.
 * Delegates to the `delete_user_data` SQL function.
 * @throws if user not found or DB returns error.
 */
export async function deleteUserData(
  userId: string,
  actorId: string = 'system',
  actorRole: string = 'admin',
): Promise<DataDeletionResult> {
  const client = getClient();
  const { data, error } = await client.rpc('delete_user_data', {
    target_user_id: userId,
    actor: actorId,
    actor_role_val: actorRole,
  });

  if (error) {
    throw new Error(`deleteUserData failed: ${error.message}`);
  }

  return data as DataDeletionResult;
}

/**
 * Resolve a user by phone number, then call deleteUserData.
 * @throws if phone number not found.
 */
export async function deleteUserDataByPhone(
  phoneNumber: string,
  actorId: string = 'system',
  actorRole: string = 'admin',
): Promise<DataDeletionResult> {
  const client = getClient();
  const { data: user, error: lookupError } = await client
    .from('users')
    .select('id')
    .eq('phone_number', phoneNumber)
    .single();

  if (lookupError || !user) {
    throw new Error(`User with phone ${phoneNumber} not found`);
  }

  return deleteUserData(user.id as string, actorId, actorRole);
}
