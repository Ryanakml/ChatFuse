'use client';

import { useTransition } from 'react';
import { takeoverConversation, returnToBot, sendMessage } from '../actions';

interface ConversationActionsProps {
  conversationId: string;
  botActive: boolean;
}

export function ConversationActions({ conversationId, botActive }: ConversationActionsProps) {
  const [isPending, startTransition] = useTransition();

  const handleTakeover = () => {
    startTransition(async () => {
      await takeoverConversation(conversationId);
    });
  };

  const handleReturn = () => {
    startTransition(async () => {
      await returnToBot(conversationId);
    });
  };

  return (
    <div className="bg-white p-4 shadow-sm border-t mt-4 sticky bottom-0">
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm font-medium text-gray-700">Actions:</span>
        {botActive ? (
          <button
            onClick={handleTakeover}
            disabled={isPending}
            className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 text-sm font-medium"
          >
            Takeover Manually
          </button>
        ) : (
          <button
            onClick={handleReturn}
            disabled={isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            Return Control to Bot
          </button>
        )}
      </div>

      {!botActive && (
        <form action={sendMessage.bind(null, conversationId)} className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="content" className="sr-only">
              Message for user
            </label>
            <textarea
              id="content"
              name="content"
              rows={2}
              placeholder="Type your response to the user..."
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium"
          >
            Send Manual Reply
          </button>
        </form>
      )}
    </div>
  );
}
