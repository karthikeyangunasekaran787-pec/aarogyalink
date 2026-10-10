// ============================================================================
// AarogyaLink — brand asset resolution
// ----------------------------------------------------------------------------
// One place that knows which files make up the AarogyaLink identity, so no
// screen hardcodes a logo path (and the old circular-network logo files can be
// retired without hunting through the app).
//
// The official mark / full lockup ship as PNG. When the PNG files are not
// present the app falls back to the vector emblem in this folder, so the brand
// is never missing and never distorted. Drop the official artwork at
//   public/assets/aarogyalink-logo-full.png   (emblem + wordmark + tagline)
//   public/assets/aarogyalink-mark.png        (emblem only, square)
// and it is picked up everywhere automatically — no code change needed.
// ============================================================================

export const BRAND_NAME = 'AarogyaLink';
export const BRAND_TAGLINE = 'Closing the Rural Healthcare Loop';

/** Emblem-only sources, tried in order. */
export const BRAND_MARK_SOURCES = [
  '/assets/aarogyalink-mark.png',
  '/assets/aarogyalink-mark.svg',
];

/** Full lockup (emblem + wordmark + tagline) sources, tried in order. */
export const BRAND_FULL_SOURCES = [
  '/assets/aarogyalink-logo-full.png',
  '/assets/aarogyalink-logo-full.svg',
];

/** Alt text for the emblem. */
export const BRAND_MARK_ALT = `${BRAND_NAME} logo`;

/** Alt text for the full lockup. */
export const BRAND_FULL_ALT = `${BRAND_NAME} — ${BRAND_TAGLINE}`;
