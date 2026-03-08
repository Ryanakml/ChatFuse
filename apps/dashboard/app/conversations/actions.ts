'use server'

import { revalidatePath } from 'next/cache';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  // In a real app we derive these from the operator session
  const headers = {
    ...options.headers,
    'x-wa-user': 'ops-admin',
    'x-wa-role': 'admin',
    'Content-Type': 'application/json'
  };
  return fetch(url, { ...options, headers });
}

export async function takeoverConversation(conversationId: string) {
  const res = await fetchWithAuth(`${API_BASE}/api/conversations/${conversationId}/takeover`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to take over');
  revalidatePath(`/conversations/${conversationId}`);
}

export async function returnToBot(conversationId: string) {
  const res = await fetchWithAuth(`${API_BASE}/api/conversations/${conversationId}/return`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to return to bot');
  revalidatePath(`/conversations/${conversationId}`);
}

export async function sendMessage(conversationId: string, formData: FormData) {
  const content = formData.get('content') as string;
  if (!content) return;
  
  const res = await fetchWithAuth(`${API_BASE}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content })
  });
  if (!res.ok) throw new Error('Failed to send message');
  revalidatePath(`/conversations/${conversationId}`);
}
