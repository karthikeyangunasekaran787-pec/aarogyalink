// ============================================================================
// SegmentedControl — one neat, equal-width segmented switch
// ----------------------------------------------------------------------------
// Before this component, each screen rolled its own row of buttons for its
// filter/tab switch, so the segments were different heights, different widths,
// and drifted out of line from screen to screen. Here the segments always:
//
//   - share one wrapper with a single padding scale and radius,
//   - are the same height with vertically centred icon + label,
//   - split the available width evenly (`flex-1`) and centre their content, so
//     "All" and "Medical College" line up as equal segments,
//   - keep numbers in tabular figures so the labels do not jump.
// ============================================================================

import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Optional count shown next to the label (e.g. "Doctors (4)"). */
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Facility type". */
  ariaLabel: string;
  size?: 'sm' | 'md';
  /** Let the segments fill the container width instead of hugging the text. */
  block?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  block = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex w-full items-stretch gap-1 rounded-xl border border-border bg-muted/60 p-1',
        !block && 'sm:w-auto',
        className,
      )}
    >
      {options.map(option => {
        const Icon = option.icon;
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg font-medium transition-all sm:flex-none',
              size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-3.5 text-xs sm:text-sm',
              selected
                ? 'bg-card text-primary shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
            )}
          >
            {Icon && <Icon className={cn('shrink-0', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />}
            <span className="truncate">{option.label}</span>
            {typeof option.count === 'number' && (
              <span className="tabular-nums opacity-70">({option.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
