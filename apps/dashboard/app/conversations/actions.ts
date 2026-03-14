'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Unauthorized: missing access token');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    throw new Error(`API error: ${res.statusText}`);
  }
  return res;
}

export async function takeoverConversation(conversationId: string) {
  await fetchWithAuth(`${API_BASE}/api/conversations/${conversationId}/takeover`, {
    method: 'POST',
  });
  revalidatePath(`/conversations/${conversationId}`);
}

export async function returnToBot(conversationId: string) {
  await fetchWithAuth(`${API_BASE}/api/conversations/${conversationId}/return`, { method: 'POST' });
  revalidatePath(`/conversations/${conversationId}`);
}

export async function sendMessage(conversationId: string, formData: FormData) {
  const content = formData.get('content') as string;
  if (!content) return;

  await fetchWithAuth(`${API_BASE}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  revalidatePath(`/conversations/${conversationId}`);
}
