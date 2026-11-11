import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'danger' | 'warning' | 'safe' | 'normal';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend = 'normal',
}) => {
  const getTrendStyle = () => {
    switch (trend) {
      case 'danger':
        return 'border-l-4 border-l-red-500 border-zinc-800 bg-[#14161d] text-red-400';
      case 'warning':
        return 'border-l-4 border-l-amber-500 border-zinc-800 bg-[#14161d] text-amber-400';
      case 'safe':
        return 'border-l-4 border-l-emerald-500 border-zinc-800 bg-[#14161d] text-emerald-400';
      default:
        return 'border-l-4 border-l-zinc-600 border-zinc-800 bg-[#12141a] text-zinc-400';
    }
  };

  return (
    <div className={`p-4 rounded-md border flex flex-col justify-between transition-colors ${getTrendStyle()}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{title}</span>
        <div className="text-zinc-500">{icon}</div>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold font-mono tracking-tight text-white tabular-nums">{value}</div>
        {subtitle && <p className="text-[11px] text-zinc-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
};
