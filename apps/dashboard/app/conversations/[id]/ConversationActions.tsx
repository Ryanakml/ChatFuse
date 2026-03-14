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
    <div className="sticky bottom-0 mt-4 border-t border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Actions:</span>
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
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-400 sm:text-sm"
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
