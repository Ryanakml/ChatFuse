import type { ConversationSummary } from '@wa-chat/shared';
import { createClient } from '@/lib/supabase/server';
import { EscalationRow } from './EscalationRow';

export const dynamic = 'force-dynamic';

async function getEscalations(): Promise<ConversationSummary[]> {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return [];
    }

    const apiUrl =
      process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    console.log('API URL:', process.env.NEXT_PUBLIC_API_URL);
    console.log('Fetching escalations...');
    const res = await fetch(`${apiUrl}/api/conversations/escalations`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: 'no-store',
    });
    console.log('Response status:', res.status);
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    console.error('Error:', error);
    return [];
  }
}

export default async function EscalationsPage() {
  const escalations = await getEscalations();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Escalation Inbox</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage unresolved conversations and monitor SLAs.
          </p>
        </div>
        <div className="rounded-md bg-white px-3 py-1 text-sm shadow ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
          <span className="font-semibold text-red-600 dark:text-red-400">{escalations.length}</span>{' '}
          active
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
        <ul className="divide-y divide-gray-200 dark:divide-gray-800">
          {escalations.length === 0 ? (
            <li className="p-8 text-center text-gray-500 dark:text-gray-400">
              No active escalations. Inbox Zero! 🎉
            </li>
          ) : (
            escalations.map((conv) => <EscalationRow key={conv.id} conv={conv} />)
          )}
        </ul>
      </div>
    </div>
  );
}
