import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'danger' | 'warning' | 'safe' | 'normal';
}

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle, icon, trend = 'normal' }) => {
  const getTrendStyle = () => {
    switch (trend) {
      case 'danger':
        return 'border-red-500/50 bg-red-950/20 text-red-400 shadow-red-500/10';
      case 'warning':
        return 'border-amber-500/50 bg-amber-950/20 text-amber-400 shadow-amber-500/10';
      case 'safe':
        return 'border-emerald-500/50 bg-emerald-950/20 text-emerald-400 shadow-emerald-500/10';
      default:
        return 'border-gray-800 bg-gray-900/40 text-gray-400';
    }
  };

  return (
    <div className={`p-4 rounded-xl border glass-panel transition-all hover:scale-[1.01] ${getTrendStyle()}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400">{title}</span>
        <div className="p-2 rounded-lg bg-gray-900/80 border border-gray-800 text-gray-200">{icon}</div>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-white">{value}</div>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
};
