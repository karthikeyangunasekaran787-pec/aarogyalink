// ============================================================================
// AarogyaLink — brand lockup
// ----------------------------------------------------------------------------
//   <BrandLogo />              emblem only (authenticated header, sidebar,
//                              mobile header, favicon-adjacent contexts)
//   <BrandLogo variant="full"/> the lockup (emblem + wordmark + tagline) for
//                              role selection, login and presentation contexts
//
// Each variant tries its sources in order (the official PNG first, then the
// vector lockup in this folder), so artwork that already contains the wordmark
// is never duplicated with typeset text beside it. Only when no artwork loads at
// all does the component typeset the name and tagline itself.
// ============================================================================

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  BRAND_FULL_ALT,
  BRAND_FULL_SOURCES,
  BRAND_MARK_ALT,
  BRAND_MARK_SOURCES,
  BRAND_NAME,
  BRAND_TAGLINE,
} from '@/lib/brand-assets';

interface BrandLogoProps {
  /** Which lockup to render. */
  variant?: 'mark' | 'full';
  /** Emblem height in px for the `mark` variant (28–34 is the header range). */
  size?: number;
  className?: string;
  /** Wordmark/tagline text size for the `full` variant. */
  textClassName?: string;
}

export function BrandLogo({ variant = 'mark', size = 32, className, textClassName }: BrandLogoProps) {
  const sources = variant === 'full' ? BRAND_FULL_SOURCES : BRAND_MARK_SOURCES;
  const [attempt, setAttempt] = useState(0);
  const src = attempt < sources.length ? sources[attempt] : null;

  // No artwork at all: fall back to typeset branding rather than a broken icon.
  // (No wordmark is drawn next to the artwork — the lockup already carries it.)
  if (!src) {
    if (variant === 'mark') {
      return (
        <span className={cn('font-bold tracking-tight text-foreground', textClassName, className)}>
          {BRAND_NAME}
        </span>
      );
    }
    return (
      <span className={cn('inline-flex flex-col items-center', className)}>
        <span className={cn('text-[26px] font-bold tracking-tight text-slate-900 sm:text-[30px]', textClassName)}>
          {BRAND_NAME}
        </span>
        <span className="mt-1 text-[13px] font-medium tracking-wide text-primary sm:text-sm">
          {BRAND_TAGLINE}
        </span>
      </span>
    );
  }

  const img = (
    <img
      key={src}
      src={src}
      alt={variant === 'full' ? BRAND_FULL_ALT : BRAND_MARK_ALT}
      height={size}
      onError={() => setAttempt(a => a + 1)}
      draggable={false}
      className="block w-auto max-w-full select-none object-contain"
      style={{ height: size }}
    />
  );

  // Both the official lockup and the vector lockup already carry the wordmark
  // and tagline, so no text is printed beside them.
  return <span className={cn('inline-flex items-center', className)}>{img}</span>;
}
