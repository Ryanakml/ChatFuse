import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let toolsSupabaseClient: SupabaseClient | null = null;

export const getToolsSupabaseClient = (): SupabaseClient => {
  if (toolsSupabaseClient) {
    return toolsSupabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  }

  toolsSupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  return toolsSupabaseClient;
};
