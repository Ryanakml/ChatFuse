'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { OpsDashboardKPIs } from '@wa-chat/shared';

export async function handleSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function fetchKPIs(): Promise<OpsDashboardKPIs | null> {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    return null;
  }

  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  try {
    const response = await fetch(`${apiUrl}/api/kpis`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      next: { revalidate: 10 },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Fetch KPI Error:', error);
    return null;
  }
}
