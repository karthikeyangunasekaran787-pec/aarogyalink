// ============================================================================
// Risk Badge - Color-coded risk level indicator
// ============================================================================

import { cn } from '@/lib/utils';
import type { RiskLevel } from '@/types';
import type { TranslationKey } from '@/lib/i18n';
import { useTranslation } from '@/hooks/use-translation';
import { ShieldCheck, AlertTriangle, AlertOctagon, Siren } from 'lucide-react';

// Labels are translation keys so the badge follows the selected language.
const RISK_CONFIG: Record<RiskLevel, {
  labelKey: TranslationKey;
  className: string;
  icon: typeof ShieldCheck;
}> = {
  low: {
    labelKey: 'riskLow',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: ShieldCheck,
  },
  medium: {
    labelKey: 'riskMedium',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: AlertTriangle,
  },
  high: {
    labelKey: 'riskHigh',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    icon: AlertOctagon,
  },
  emergency: {
    labelKey: 'riskEmergency',
    className: 'bg-red-50 text-red-700 border-red-200',
    icon: Siren,
  },
};

export function RiskBadge({
  level,
  size = 'md',
  showIcon = true,
}: {
  level: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}) {
  const { t } = useTranslation();
  const config = RISK_CONFIG[level];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-3 py-1 text-sm',
        size === 'lg' && 'px-4 py-1.5 text-base',
        config.className
      )}
    >
      {showIcon && <Icon className={cn(
        size === 'sm' && 'h-3 w-3',
        size === 'md' && 'h-4 w-4',
        size === 'lg' && 'h-5 w-5',
      )} />}
      {t(config.labelKey)}
    </span>
  );
}

// Priority badge variant
export function PriorityBadge({
  priority,
}: {
  priority: 'routine' | 'urgent' | 'emergency';
}) {
  const { t } = useTranslation();
  const configs: Record<'routine' | 'urgent' | 'emergency', { labelKey: TranslationKey; className: string; icon?: typeof Siren }> = {
    routine: { labelKey: 'routine', className: 'bg-slate-50 text-slate-600 border-slate-200' },
    urgent: { labelKey: 'urgent', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    emergency: { labelKey: 'riskEmergency', className: 'bg-red-50 text-red-700 border-red-200', icon: Siren },
  };
  const config = configs[priority];

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
      config.className
    )}>
      {config.icon && <config.icon className="h-3 w-3" />}
      {t(config.labelKey)}
    </span>
  );
}

// Status badge
export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const colorMap: Record<string, string> = {
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
    confirmed: 'bg-green-50 text-green-700 border-green-200',
    in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
    missed: 'bg-red-50 text-red-700 border-red-200',
    overdue: 'bg-red-50 text-red-700 border-red-200',
    rescheduled: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  // Known appointment statuses are translated; an unknown one falls back to the
  // stored value with underscores humanised, never to a raw translation key.
  const known: Record<string, TranslationKey> = {
    scheduled: 'scheduled',
    confirmed: 'accepted',
    completed: 'completed',
    cancelled: 'cancelled',
    missed: 'missed',
    overdue: 'overdueLabel',
    rescheduled: 'scheduled',
  };
  const label = known[status] ? t(known[status]) : status.replace(/_/g, ' ');

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
      colorMap[status] || 'bg-gray-50 text-gray-600 border-gray-200'
    )}>
      {label}
    </span>
  );
}
