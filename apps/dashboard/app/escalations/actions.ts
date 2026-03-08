'use server';

import { revalidatePath } from 'next/cache';
import type { EscalationStatus } from '@wa-chat/shared';

const API_BASE_URL = 'http://localhost:3001/api';

// Helper to make API calls to our backend proxying the auth
async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-wa-user': 'ops-admin', // Mocked user ID
    'x-wa-role': 'admin', // Mocked role
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.statusText}`);
  }

  return res.json();
}

export async function assignOperatorAction(conversationId: string, operatorId: string | null) {
  try {
    await fetchApi(`/conversations/${conversationId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ operatorId }),
    });
    revalidatePath('/escalations');
    return { success: true };
  } catch (error) {
    console.error('Assign error:', error);
    return { success: false, error: 'Failed to assign operator' };
  }
}

export async function updateEscalationStatusAction(
  conversationId: string,
  status: EscalationStatus,
) {
  try {
    await fetchApi(`/conversations/${conversationId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    revalidatePath('/escalations');
    return { success: true };
  } catch (error) {
    console.error('Status update error:', error);
    return { success: false, error: 'Failed to update status' };
  }
}
