'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function getApiHeaders(token: string) {
  // Use the admin credentials needed for the L1 security endpoint
  // Based on the API index.ts, it requires x-wa-user and x-wa-role headers for enforceAdminAccess
  // And requires Bearer token for authenticateRequest
  // Actually enforceAdminAccess checks `req.header(adminAuthHeader)` which defaults to 'x-wa-user'
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-wa-user': 'dashboard-admin',
    'x-wa-role': 'admin',
  };
}

export async function addKnowledgeDocument(formData: FormData) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Unauthorized: No active session');
  
  const title = formData.get('title');
  const sourceType = formData.get('sourceType');
  const content = formData.get('content');
  
  if (!content || !title) {
    throw new Error('Title and Content are required');
  }

  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  
  const response = await fetch(`${apiUrl}/api/admin/knowledge`, {
    method: 'POST',
    headers: getApiHeaders(session.access_token),
    body: JSON.stringify({
      title,
      sourceType,
      content,
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown API Error' }));
    throw new Error(errorData.error || 'Failed to add knowledge document');
  }
  
  revalidatePath('/knowledge');
  return { success: true };
}

export async function deleteKnowledgeDocument(id: string) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Unauthorized');
  
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  
  const response = await fetch(`${apiUrl}/api/admin/knowledge/${id}`, {
    method: 'DELETE',
    headers: getApiHeaders(session.access_token),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown API Error' }));
    throw new Error(errorData.error || 'Failed to delete knowledge document');
  }
  
  revalidatePath('/knowledge');
  return { success: true };
}
