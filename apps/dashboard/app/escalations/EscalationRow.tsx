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

  const getSlaInfo = () => {
    if (!conv.slaBreachAt) return { text: 'No SLA', color: 'text-gray-500' };
    const breachTime = new Date(conv.slaBreachAt).getTime();
    const diff = breachTime - now;

    if (diff < 0) {
      return {
        text: `Breached ${Math.abs(Math.round(diff / 60000))}m ago`,
        color: 'text-red-600 font-bold',
      };
    }
    if (diff < 3600000) {
      return {
        text: `Breaches in ${Math.round(diff / 60000)}m`,
        color: 'text-orange-600 font-medium',
      };
    }
    return { text: `Breaches in ${Math.round(diff / 3600000)}h`, color: 'text-green-600' };
  };

  const sla = getSlaInfo();

  return (
    <li className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between gap-4">
      <Link href={`/conversations/${conv.id}`} className="flex-1">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-gray-900">Conv: {conv.id}</span>
          <span className="text-sm text-gray-500">User: {conv.userId}</span>
        </div>
      </Link>

      <div className="flex items-center gap-6">
        <div className="flex flex-col text-sm text-right">
          <span className="text-gray-500">SLA:</span>
          <span className={sla.color}>{sla.text}</span>
        </div>

        <div className="flex flex-col gap-2 min-w-[150px]">
          <select
            className="text-sm border-gray-300 rounded-md py-1 px-2 disabled:opacity-50"
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
            className="text-sm border-gray-300 rounded-md py-1 px-2 disabled:opacity-50 font-medium"
            value={conv.escalationStatus || 'open'}
            onChange={(e) => handleStatusChange(e.target.value as EscalationStatus)}
            disabled={isPending}
            style={{
              backgroundColor:
                conv.escalationStatus === 'resolved'
                  ? '#dcfce7'
                  : conv.escalationStatus === 'pending'
                    ? '#fef08a'
                    : '#fee2e2',
            }}
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
