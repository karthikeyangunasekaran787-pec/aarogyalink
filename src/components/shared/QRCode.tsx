// ============================================================================
// QR Code — a real, scannable QR (not a decorative pattern)
// ----------------------------------------------------------------------------
// The Health Card QR and the referral QR must actually scan with a camera, so
// this renders a genuine QR symbol through the `qrcode` encoder. While the
// symbol is being generated the box stays empty; it never shows a fake pattern
// that a scanner could not read.
// ============================================================================

import { useEffect, useState } from 'react';
import QRCodeEncoder from 'qrcode';
import { cn } from '@/lib/utils';

interface QRCodeProps {
  data: string;
  size?: number;
  className?: string;
  label?: string;
}

export function QRCode({ data, size = 128, className, label }: QRCodeProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    // `width` is the rendered pixel size; twice the display size keeps the
    // modules crisp on high-density screens and when scanned off a screen.
    QRCodeEncoder.toDataURL(data, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size * 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(url => { if (!cancelled) setSrc(url); })
      .catch(() => { if (!cancelled) { setSrc(null); setFailed(true); } });
    return () => { cancelled = true; };
  }, [data, size]);

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div
        className="flex items-center justify-center rounded-lg border border-border bg-white p-2 shadow-sm"
        style={{ width: size + 16, height: size + 16 }}
      >
        {src ? (
          <img src={src} width={size} height={size} alt="QR code" className="block" />
        ) : (
          <span className="px-2 text-center text-[10px] text-muted-foreground">
            {failed ? 'QR unavailable' : ''}
          </span>
        )}
      </div>
      {label && <p className="font-mono text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}
