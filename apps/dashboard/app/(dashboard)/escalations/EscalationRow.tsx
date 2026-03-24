'use client';

import { useTransition, useState, useEffect } from 'react';
import type { ConversationSummary, EscalationStatus } from '@wa-chat/shared';
import { assignOperatorAction, updateEscalationStatusAction } from './actions';
import Link from 'next/link';

export function EscalationRow({ conv }: { conv: ConversationSummary }) {
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    // Only set up interval if there's an SLA to track
    if (!conv.slaBreachAt) return;

    // Update every minute (60000 ms)
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => clearInterval(interval);
  }, [conv.slaBreachAt]);

  const handleAssign = (operatorId: string | null) => {
    startTransition(async () => {
      await assignOperatorAction(conv.id, operatorId);
    });
  };

  const handleStatusChange = (status: EscalationStatus) => {
    startTransition(async () => {
      await updateEscalationStatusAction(conv.id, status);
    });
  };

  const statusClass =
    conv.escalationStatus === 'resolved'
      ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
      : conv.escalationStatus === 'pending'
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'
        : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';

  const getSlaInfo = () => {
    if (!conv.slaBreachAt) return { text: 'No SLA', color: 'text-gray-500 dark:text-gray-400' };
    const breachTime = new Date(conv.slaBreachAt).getTime();
    const diff = breachTime - now;

    if (diff < 0) {
      return {
        text: `Breached ${Math.abs(Math.round(diff / 60000))}m ago`,
        color: 'font-bold text-red-600 dark:text-red-400',
      };
    }
    if (diff < 3600000) {
      return {
        text: `Breaches in ${Math.round(diff / 60000)}m`,
        color: 'font-medium text-orange-600 dark:text-orange-400',
      };
    }
    return { text: `Breaches in ${Math.round(diff / 3600000)}h`, color: 'text-green-600 dark:text-green-400' };
  };

  const sla = getSlaInfo();

  return (
    <li className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60">
      <Link href={`/conversations/${conv.id}`} className="flex-1">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-gray-900 dark:text-gray-100">Conv: {conv.id}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">User: {conv.userId}</span>
        </div>
      </Link>

      <div className="flex items-center gap-6">
        <div className="flex flex-col text-sm text-right">
          <span className="text-gray-500 dark:text-gray-400">SLA:</span>
          <span className={sla.color}>{sla.text}</span>
        </div>

        <div className="flex flex-col gap-2 min-w-[150px]">
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            value={conv.assignedTo || ''}
            onChange={(e) => handleAssign(e.target.value || null)}
            disabled={isPending}
          >
            <option value="">Unassigned</option>
            <option value="user-operator-1">Operator 1</option>
            <option value="user-operator-2">Operator 2</option>
            <option value="ops-admin">Admin</option>
          </select>

          <select
            className={`rounded-md border border-gray-300 px-2 py-1 text-sm font-medium disabled:opacity-50 dark:border-gray-700 ${statusClass}`}
            value={conv.escalationStatus || 'open'}
            onChange={(e) => handleStatusChange(e.target.value as EscalationStatus)}
            disabled={isPending}
          >
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>
    </li>
  );
}
