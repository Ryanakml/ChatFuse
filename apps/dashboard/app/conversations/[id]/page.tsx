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
    return <div className="p-8 text-center text-red-500">Conversation not found</div>;
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-6 flex justify-between items-center bg-gray-50 p-4 rounded-lg border">
        <div>
          <h1 className="text-xl font-bold">Conversation: {summary.id}</h1>
          <p className="text-gray-500 text-sm">User: {summary.userId}</p>
        </div>
        <div>
          <span
            className={`px-2 py-1 rounded text-sm font-medium mr-2 ${summary.botActive ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}
          >
            {summary.botActive ? '🤖 BOT ACTIVE' : '👤 MANUAL TAKEOVER'}
          </span>
          <span className="px-2 py-1 rounded text-sm font-medium bg-gray-200 text-gray-800">
            {summary.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="space-y-4 bg-white p-6 shadow-sm rounded border min-h-100">
        {timeline.length === 0 && (
          <p className="text-gray-500 text-center py-10">No messages yet.</p>
        )}
        {timeline.map((item) => {
          if (item.type === 'message') {
            return (
              <div
                key={item.id}
                className={`p-4 rounded-lg max-w-[80%] ${
                  item.senderRole === 'user'
                    ? 'bg-indigo-50 border border-indigo-100 mr-auto'
                    : item.senderRole === 'bot'
                      ? 'bg-gray-100 border border-gray-200 ml-auto'
                      : 'bg-orange-50 border border-orange-200 ml-auto'
                }`}
              >
                <div className="flex justify-between items-center mb-1 gap-4">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-600">
                    {item.senderRole}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(item.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-gray-900 whitespace-pre-wrap">{item.content}</p>
              </div>
            );
          }

          if (item.type === 'event') {
            return (
              <div
                key={item.id}
                className="my-2 p-3 bg-blue-50 border border-blue-100 rounded text-xs w-full font-mono whitespace-pre-wrap break-all shadow-inner"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-blue-800 font-bold">⚡ AGENT EVENT: {item.eventType}</span>
                  <span className="text-gray-400">
                    {new Date(item.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-gray-600">{JSON.stringify(item.details, null, 2)}</div>
              </div>
            );
          }
          return null;
        })}
      </div>

      <ConversationActions conversationId={summary.id} botActive={summary.botActive} />
    </div>
  );
}
