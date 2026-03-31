import { ConversationTimelineItem, ConversationSummary } from '@wa-chat/shared';
import { createClient } from '@/lib/supabase/server';
import { ConversationActions } from './ConversationActions';


const apiUrl = process.env.API_URL;

async function getAccessToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function getTimeline(id: string): Promise<ConversationTimelineItem[]> {
  console.log('API URL:', process.env.API_URL);
  console.log('Fetching conversation timeline...');
  try {
    if (!apiUrl) {
      return [];
    }
    const token = await getAccessToken();
    if (!token) {
      return [];
    }
    const timelineUrl = `${apiUrl}/api/conversations/${id}/timeline`;
    console.log('Timeline URL:', timelineUrl);
    const res = await fetch(timelineUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    console.log('Response status:', res.status);
    if (!res.ok) return [];
    return res.json();
  } catch (error) {
    console.error('Error:', error);
    return [];
  }
}

async function getSummary(id: string): Promise<ConversationSummary | null> {
  console.log('API URL:', process.env.API_URL);
  console.log('Fetching conversation summary...');
  try {
    if (!apiUrl) {
      return null;
    }
    const token = await getAccessToken();
    if (!token) {
      return null;
    }
    const res = await fetch(`${apiUrl}/api/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    console.log('Response status:', res.status);
    if (!res.ok) return null;
    const list: ConversationSummary[] = await res.json();
    return list.find((c) => c.id === id) || null;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const summary = await getSummary(id);
  const timeline = await getTimeline(id);

  if (!summary) {
    return (
      <>
        <div className="p-8 text-center text-red-500 dark:text-red-300">Conversation not found</div>
      </>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-4xl py-8">
        <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Conversation: {summary.id}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">User: {summary.userId}</p>
          </div>
          <div>
            <span
              className={`mr-2 rounded px-2 py-1 text-sm font-medium ${
                summary.botActive
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200'
                  : 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200'
              }`}
            >
              {summary.botActive ? '🤖 BOT ACTIVE' : '👤 MANUAL TAKEOVER'}
            </span>
            <span className="rounded bg-gray-200 px-2 py-1 text-sm font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
              {summary.status.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="min-h-100 space-y-4 rounded border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {timeline.length === 0 && (
            <p className="py-10 text-center text-gray-500 dark:text-gray-400">No messages yet.</p>
          )}
          {timeline.map((item) => {
            if (item.type === 'message') {
              return (
                <div
                  key={item.id}
                  className={`max-w-[80%] rounded-lg p-4 ${
                    item.senderRole === 'user'
                      ? 'mr-auto border border-indigo-100 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/40'
                      : item.senderRole === 'bot'
                        ? 'ml-auto border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800'
                        : 'ml-auto border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-4">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      {item.senderRole}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{item.content}</p>
                </div>
              );
            }

            if (item.type === 'event') {
              return (
                <div
                  key={item.id}
                  className="my-2 w-full break-all rounded border border-blue-100 bg-blue-50 p-3 font-mono text-xs whitespace-pre-wrap shadow-inner dark:border-blue-900 dark:bg-blue-950/40"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-bold text-blue-800 dark:text-blue-200">⚡ AGENT EVENT: {item.eventType}</span>
                    <span className="text-gray-400 dark:text-gray-500">
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-gray-600 dark:text-gray-300">{JSON.stringify(item.details, null, 2)}</div>
                </div>
              );
            }
            return null;
          })}
        </div>

        <ConversationActions conversationId={summary.id} botActive={summary.botActive} />
      </div>
    </>
  );
}
