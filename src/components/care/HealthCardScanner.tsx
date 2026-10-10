// ============================================================================
// AarogyaLink — camera Health Card scanner
// ----------------------------------------------------------------------------
// Uses the device camera (rear-facing where available) and decodes the QR frame
// by frame. Nothing is uploaded while scanning: the decoded reference is handed
// to the caller, which asks the backend to authorize it.
//
// Every failure has its own state and its own plain-language message, so the
// reception desk always knows what to do next (usually: type the card number).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Button } from '@/components/ui/button';
import { Camera, CameraOff, Loader2, RefreshCw, ScanLine } from 'lucide-react';

export type ScannerState = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'error';

interface HealthCardScannerProps {
  /** Called once with the decoded QR text. Scanning stops until `restart`. */
  onDetected: (raw: string) => void;
  className?: string;
}

export function HealthCardScanner({ onDetected, className }: HealthCardScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectedRef = useRef(false);

  const [state, setState] = useState<ScannerState>('starting');
  const [attempt, setAttempt] = useState(0);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    detectedRef.current = false;
    setState('starting');

    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      setState('unavailable');
      return;
    }

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || detectedRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context) {
          context.drawImage(video, 0, 0, width, height);
          const frame = context.getImageData(0, 0, width, height);
          const found = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
          if (found?.data) {
            detectedRef.current = true;
            onDetected(found.data);
            stopCamera();
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    media
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        // iOS needs the explicit play() after the metadata is ready.
        void video.play().catch(() => { /* autoplay policy — the user can tap again */ });
        setState('scanning');
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') setState('denied');
        else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') setState('unavailable');
        else setState('error');
      });

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [attempt, onDetected, stopCamera]);

  const restart = () => setAttempt(current => current + 1);

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-slate-900">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="aspect-[4/3] w-full object-cover sm:aspect-video"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scan frame */}
        {state === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-44 w-44 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)] sm:h-56 sm:w-56" />
            <ScanLine className="absolute h-6 w-6 animate-pulse text-white/90" />
          </div>
        )}

        {state === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/90">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-xs">Starting camera…</p>
          </div>
        )}

        {(state === 'denied' || state === 'unavailable' || state === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/90">
            {state === 'denied' ? <CameraOff className="h-7 w-7" /> : <Camera className="h-7 w-7" />}
            <p className="text-sm font-medium">
              {state === 'denied' ? 'Camera access was denied.' : 'Camera access is unavailable.'}
            </p>
            <p className="text-xs text-white/70">
              Enter the Health Card ID manually below — the record is verified the same way.
            </p>
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={restart}>
              <RefreshCw className="h-3.5 w-3.5" /> Try camera again
            </Button>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Hold the patient&apos;s AarogyaLink Health Card so the QR sits inside the frame.
      </p>
    </div>
  );
}
