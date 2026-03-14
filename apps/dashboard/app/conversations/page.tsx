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
    const res = await fetch(`${apiUrl}/api/conversations`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    return [];
  }
}

export default async function ConversationsPage() {
  const conversations = await getConversations();

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Conversations</h1>
      </div>

      <div className="bg-white rounded-lg shadow ring-1 ring-gray-200 overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {conversations.length === 0 ? (
            <li className="p-8 text-center text-gray-500">No active conversations.</li>
          ) : (
            conversations.map((conv) => (
              <li key={conv.id} className="hover:bg-gray-50 transition-colors">
                <Link
                  href={`/conversations/${conv.id}`}
                  className="flex items-center justify-between p-4"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-gray-900">Conv: {conv.id}</span>
                    <span className="text-sm text-gray-500">User: {conv.userId}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          conv.status === 'escalated'
                            ? 'bg-red-100 text-red-800'
                            : conv.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {conv.status.toUpperCase()}
                      </span>
                      {conv.botActive ? (
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                          BOT ACTIVE
                        </span>
                      ) : (
                        <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs font-medium">
                          MANUAL
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
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
  );
}
