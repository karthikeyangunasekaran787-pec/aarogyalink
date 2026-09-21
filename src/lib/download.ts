// ============================================================================
// File download / share helpers
// ----------------------------------------------------------------------------
// The patient app runs offline-first in rural areas, so these use only browser
// APIs (Blob + object URLs) — no network round trip and no extra dependency.
// ============================================================================

/** Save text as a file via the browser's download mechanism. */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick: revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type ShareOutcome = 'shared' | 'copied' | 'failed';

/**
 * Share text through the device share sheet when the browser supports it, and
 * fall back to the clipboard (a cancelled share sheet is not an error).
 */
export async function shareText(title: string, text: string): Promise<ShareOutcome> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (nav?.share) {
    try {
      await nav.share({ title, text });
      return 'shared';
    } catch (error) {
      // A dismissed share sheet rejects; treat anything but an explicit cancel
      // as a reason to fall through to the clipboard.
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
    }
  }
  try {
    await nav?.clipboard?.writeText(text);
    return nav?.clipboard ? 'copied' : 'failed';
  } catch {
    return 'failed';
  }
}

/** A filename-safe fragment (health card ids carry dashes, names may not). */
export function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'record';
}
