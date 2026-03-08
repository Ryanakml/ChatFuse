import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export function KpiCard({ title, value, description, trend }: KpiCardProps) {
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col">
      <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-gray-900">{value}</span>
        {trend === 'up' && <span className="text-xs text-green-600 font-medium">↑</span>}
        {trend === 'down' && <span className="text-xs text-red-600 font-medium">↓</span>}
      </div>
      {description && <p className="text-xs text-gray-400 mt-2">{description}</p>}
    </div>
  );
}
