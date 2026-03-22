'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { OpsDashboardKPIs } from '@wa-chat/shared';

export async function handleSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath('/dashboard', 'layout');
  redirect('/login');
}

export async function fetchKPIs(): Promise<OpsDashboardKPIs | null> {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  console.log('Session error:', error);
  console.log('Has session:', !!session);
  console.log('Has token:', !!session?.access_token);
  console.log('API URL:', process.env.API_URL);

  if (error || !session?.access_token) {
    console.log('Early return — no session');
    return null;
  }

  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  try {
    console.log('Fetching KPIs from:', `${apiUrl}/api/kpis`);
    const response = await fetch(`${apiUrl}/api/kpis`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      next: { revalidate: 10 },
    });

    console.log('KPI Response status:', response.status);
    if (!response.ok) {
      console.log('KPI Response not ok:', await response.text());
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Fetch KPI Error:', error);
    return null;
  }
}
