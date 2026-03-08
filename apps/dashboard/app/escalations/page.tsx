import type { ConversationSummary } from '@wa-chat/shared';
import { EscalationRow } from './EscalationRow';

async function getEscalations(): Promise<ConversationSummary[]> {
  try {
    const res = await fetch('http://localhost:3001/api/conversations/escalations', {
      headers: {
        'x-wa-user': 'ops-admin',
        'x-wa-role': 'admin',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    console.error('Failed to fetch escalations:', error);
    return [];
  }
}

export default async function EscalationsPage() {
  const escalations = await getEscalations();

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Escalation Inbox</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage unresolved conversations and monitor SLAs.
          </p>
        </div>
        <div className="bg-white rounded-md px-3 py-1 text-sm shadow ring-1 ring-gray-200">
          <span className="font-semibold text-red-600">{escalations.length}</span> active
        </div>
      </div>

      <div className="bg-white rounded-lg shadow ring-1 ring-gray-200 overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {escalations.length === 0 ? (
            <li className="p-8 text-center text-gray-500">No active escalations. Inbox Zero! 🎉</li>
          ) : (
            escalations.map((conv) => <EscalationRow key={conv.id} conv={conv} />)
          )}
        </ul>
      </div>
    </div>
  );
}
