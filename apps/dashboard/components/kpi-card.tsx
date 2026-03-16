import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export function KpiCard({ title, value, description, trend }: KpiCardProps) {
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</span>
        {trend === 'up' && <span className="text-xs font-medium text-green-600 dark:text-green-400">↑</span>}
        {trend === 'down' && <span className="text-xs font-medium text-red-600 dark:text-red-400">↓</span>}
      </div>
      {description && <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{description}</p>}
    </div>
  );
}
