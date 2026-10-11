// ============================================================================
// AarogyaLink — "Continue" action
// ----------------------------------------------------------------------------
// The single primary action on the entry screen. Disabled until a role is
// chosen; the arrow nudges right on hover and the button dips slightly on
// press. Navigation is owned by the caller so the existing auth flow is
// untouched.
// ============================================================================

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

export interface ContinueButtonProps {
  disabled: boolean;
  onClick: () => void;
}

export function ContinueButton({ disabled, onClick }: ContinueButtonProps) {
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.975 }}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.34, delay: 0.56 }}
      className={[
        'group inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] px-8',
        'text-[15px] font-semibold transition-all duration-200 ease-out sm:w-auto sm:min-w-[190px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        disabled
          ? 'cursor-not-allowed bg-slate-300 text-white/90 shadow-none'
          : 'bg-primary text-primary-foreground shadow-[0_10px_24px_-14px_rgba(13,148,136,0.85)] hover:bg-[rgb(15,118,110)] hover:shadow-[0_14px_30px_-14px_rgba(13,148,136,0.95)]',
      ].join(' ')}
    >
      {t('continueLabel')}
      <ArrowRight
        aria-hidden="true"
        className={[
          'h-4 w-4 transition-transform duration-200 ease-out',
          disabled ? '' : 'group-hover:translate-x-1',
        ].join(' ')}
      />
    </motion.button>
  );
}

export default ContinueButton;
