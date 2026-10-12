// ============================================================================
// PageHeader — the same page top in every role interface
// ----------------------------------------------------------------------------
// Each role screen used to hand-roll its heading, so the title size, icon
// treatment, subtitle spacing and where the actions sat differed from screen to
// screen (and stacked awkwardly on phones). PageHeader fixes the anatomy once:
//
//   [icon]  Title                        [ actions ]
//           Subtitle / context line
//
// On narrow screens the block stacks and the actions stay full-width-friendly
// instead of colliding with a long title.
// ============================================================================

import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Optional leading icon, shown in a tinted rounded tile. */
  icon?: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  /** Buttons or links aligned to the end of the header row. */
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ icon: Icon, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {subtitle && (
            <div className="mt-1 text-sm leading-snug text-muted-foreground">{subtitle}</div>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>
      )}
    </header>
  );
}
