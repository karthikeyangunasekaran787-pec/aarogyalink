// ============================================================================
// AarogyaLink — role card
// ----------------------------------------------------------------------------
// One selectable role on the entry screen. Interaction states are CSS
// transitions (cheap, no re-render); the entrance uses Framer Motion so the
// six cards can stagger in without the layout shifting.
//
// Accessibility: the whole card is a real <button> with aria-pressed, so
// selection is exposed to assistive technology and works from the keyboard.
// ============================================================================

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, type LucideIcon } from 'lucide-react';

import type { RoleTint } from '@/lib/role-options';

export type { RoleTint };

const TINT_TILE: Record<RoleTint, string> = {
  teal: 'bg-teal-50 text-teal-700 group-hover:bg-teal-100',
  blue: 'bg-blue-50 text-blue-700 group-hover:bg-blue-100',
  violet: 'bg-violet-50 text-violet-700 group-hover:bg-violet-100',
  amber: 'bg-amber-50 text-amber-700 group-hover:bg-amber-100',
  slate: 'bg-slate-100 text-slate-700 group-hover:bg-slate-200',
};

const TINT_TILE_ACTIVE: Record<RoleTint, string> = {
  teal: 'bg-primary text-primary-foreground',
  blue: 'bg-blue-600 text-white',
  violet: 'bg-violet-600 text-white',
  amber: 'bg-amber-600 text-white',
  slate: 'bg-slate-700 text-white',
};

export interface RoleIconProps {
  icon: LucideIcon;
  tint: RoleTint;
  selected: boolean;
}

/** The icon tile. Kept separate so it can be reused by other role surfaces. */
export function RoleIcon({ icon: Icon, tint, selected }: RoleIconProps) {
  return (
    <span
      className={[
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-200',
        selected ? TINT_TILE_ACTIVE[tint] : TINT_TILE[tint],
      ].join(' ')}
    >
      <Icon
        className="h-5 w-5 transition-transform duration-200 ease-out group-hover:scale-110"
        aria-hidden="true"
      />
    </span>
  );
}

export interface RoleCardProps {
  label: string;
  description: string;
  icon: LucideIcon;
  tint: RoleTint;
  selected: boolean;
  onSelect: () => void;
  /** Position in the grid, used only for the entrance stagger. */
  index: number;
}

export function RoleCard({
  label,
  description,
  icon,
  tint,
  selected,
  onSelect,
  index,
}: RoleCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      // Cards stagger in once; nothing animates continuously.
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.34, ease: 'easeOut' as const, delay: 0.18 + index * 0.06 }
      }
      className="h-full"
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={[
          'group relative flex h-full w-full items-center gap-3.5 rounded-[18px] border p-4 text-left',
          'transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out',
          'hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
          selected
            ? 'border-primary bg-primary/[0.055] shadow-[0_10px_26px_-16px_rgba(13,148,136,0.75),0_0_0_1px_rgba(13,148,136,0.28)] -translate-y-0.5'
            : 'border-slate-200/85 bg-white/80 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_6px_18px_-14px_rgba(16,24,40,0.22)] hover:border-primary/45 hover:shadow-[0_14px_30px_-18px_rgba(16,24,40,0.35)]',
        ].join(' ')}
      >
        <RoleIcon icon={icon} tint={tint} selected={selected} />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-snug text-slate-900">
            {label}
          </span>
          <span className="mt-0.5 block truncate text-[13px] leading-snug text-slate-500">
            {description}
          </span>
        </span>

        {/* Check indicator — a non-colour signal that this card is selected. */}
        {selected ? (
          <span
            data-testid="role-card-check"
            aria-hidden="true"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        ) : (
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ease-out group-hover:translate-x-1 group-hover:text-primary"
          />
        )}
      </button>
    </motion.div>
  );
}
