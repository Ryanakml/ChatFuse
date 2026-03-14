'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_BASE_URL ||
  'http://localhost:3001';

type ActionResult = {
  success: boolean;
  error?: string;
};

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

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    throw new Error(`API network error: ${message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const details = body || res.statusText;
    throw new Error(`API error (${res.status}): ${details}`);
  }
  return res;
}

export async function takeoverConversation(conversationId: string): Promise<ActionResult> {
  try {
    await fetchWithAuth(`${API_BASE}/api/conversations/${conversationId}/takeover`, {
      method: 'POST',
    });
    revalidatePath(`/conversations/${conversationId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to take over conversation';
    console.error('takeoverConversation failed:', error);
    return { success: false, error: message };
  }
}

export async function returnToBot(conversationId: string): Promise<ActionResult> {
  try {
    await fetchWithAuth(`${API_BASE}/api/conversations/${conversationId}/return`, { method: 'POST' });
    revalidatePath(`/conversations/${conversationId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to return conversation to bot';
    console.error('returnToBot failed:', error);
    return { success: false, error: message };
  }
}

export async function sendMessage(conversationId: string, formData: FormData): Promise<ActionResult> {
  const content = formData.get('content') as string;
  if (!content) {
    return { success: false, error: 'Message content required' };
  }

  try {
    await fetchWithAuth(`${API_BASE}/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    revalidatePath(`/conversations/${conversationId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send message';
    console.error('sendMessage failed:', error);
    return { success: false, error: message };
  }
}
