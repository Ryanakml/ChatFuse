import type { ConversationSummary } from '@wa-chat/shared';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';


export const dynamic = 'force-dynamic';

// Use a relative valid proxy or local call against Next.js in production
// For now, this queries the local api server on port 3001
async function getConversations(): Promise<ConversationSummary[]> {
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
    console.log('Fetching conversations...');
    const res = await fetch(`${apiUrl}/api/conversations`, {
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

export default async function ConversationsPage() {
  const conversations = await getConversations();

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Conversations</h1>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {conversations.length === 0 ? (
              <li className="p-8 text-center text-gray-500 dark:text-gray-400">No active conversations.</li>
            ) : (
              conversations.map((conv) => (
                <li key={conv.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <Link
                    href={`/conversations/${conv.id}`}
                    className="flex items-center justify-between p-4"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">Conv: {conv.id}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">User: {conv.userId}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            conv.status === 'escalated'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200'
                              : conv.status === 'active'
                                ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                          }`}
                        >
                          {conv.status.toUpperCase()}
                        </span>
                        {conv.botActive ? (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
                            BOT ACTIVE
                          </span>
                        ) : (
                          <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-950/50 dark:text-orange-200">
                            MANUAL
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(conv.lastMessageAt).toLocaleString()}
                      </span>
                    </div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </>
  );
}
