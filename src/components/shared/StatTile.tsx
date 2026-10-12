// ============================================================================
// StatTile — one KPI tile, identical in every role interface
// ----------------------------------------------------------------------------
// The dashboards had the same tile copied by hand with small drifts between
// them (icon size, gap, whether the number was tabular). One component keeps
// the row of tiles aligned: same height, same icon box, same baseline for the
// number, same label size — and it lines up in a grid because every tile is
// `h-full`.
// ============================================================================

import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StatTone = 'primary' | 'blue' | 'emerald' | 'amber' | 'violet' | 'red';

const TONE_CLASSES: Record<StatTone, string> = {
  primary: 'bg-primary/10 text-primary',
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600',
  red: 'bg-red-50 text-red-600',
};

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  tone?: StatTone;
  /** Optional secondary line under the label. */
  hint?: string;
  onClick?: () => void;
  className?: string;
}

export function StatTile({ icon: Icon, label, value, tone = 'primary', hint, onClick, className }: StatTileProps) {
  return (
    <Card
      className={cn(
        'h-full transition-shadow',
        onClick && 'cursor-pointer hover:shadow-md',
        className,
      )}
      onClick={onClick}
    >
      <CardContent className="flex h-full items-center gap-3 p-4">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONE_CLASSES[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl leading-none font-bold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{label}</p>
          {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
