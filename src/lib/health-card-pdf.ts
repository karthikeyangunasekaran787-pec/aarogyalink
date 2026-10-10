// ============================================================================
// AarogyaLink — Digital Health Card PDF
// ----------------------------------------------------------------------------
// Renders the patient's own card as a printable PDF, entirely on the device so
// it works offline. The card shows the patient's stored details plus a QR that
// carries ONLY the Health Card reference — no diagnosis, prescription, vitals
// or any other medical data is embedded in the code. Access to the record
// behind it is verified by the backend.
//
// The official mark is embedded when `public/assets/aarogyalink-mark.png`
// exists; otherwise the emblem is drawn with vector primitives, so the card
// always carries the AarogyaLink identity and never a broken image.
// ============================================================================

import { jsPDF } from 'jspdf';
import QRCodeEncoder from 'qrcode';
import { healthCardQrPayload } from '@/lib/health-card';
import { BRAND_MARK_SOURCES, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand-assets';
import { safeFilePart } from '@/lib/download';

export interface HealthCardPdfInput {
  name: string;
  healthCardId: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
  facilityName?: string;
  phone?: string;
  emergencyContact?: string;
  village?: string;
  district?: string;
}

const CARD_W = 120;
const CARD_H = 85;

const SLATE = '#0f172a';
const MUTED = '#64748b';
const TEAL = '#0e9488';
const BLUE = '#1d6ff2';
const LEAF = '#10b981';

/** Human date, e.g. 08 Oct 2026. */
function today(): string {
  const d = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Best-effort PNG data URL for the official mark (null when unavailable). */
async function loadMarkPng(): Promise<string | null> {
  for (const src of BRAND_MARK_SOURCES) {
    if (!src.endsWith('.png')) continue;
    try {
      const response = await fetch(src);
      if (!response.ok) continue;
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read_failed'));
        reader.readAsDataURL(blob);
      });
    } catch {
      /* try the next source */
    }
  }
  return null;
}

export async function buildHealthCardPdf(input: HealthCardPdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [CARD_W, CARD_H] });

  // ── Header band ─────────────────────────────────────────────────
  doc.setFillColor(BLUE);
  doc.rect(0, 0, 3, 22, 'F');
  doc.setFillColor('#f1f5f9');
  doc.rect(0, 0, CARD_W, 22, 'F');
  doc.setFillColor(BLUE);
  doc.rect(0, 0, 3, 22, 'F');

  // Emblem: the official PNG when present, otherwise drawn (teal tile + white cross).
  const mark = await loadMarkPng();
  if (mark) {
    doc.addImage(mark, 'PNG', 8, 4.5, 13, 13);
  } else {
    doc.setFillColor(TEAL);
    doc.roundedRect(8, 4.5, 13, 13, 2.4, 2.4, 'F');
    doc.setFillColor('#ffffff');
    doc.roundedRect(12.7, 6.4, 3.6, 9.2, 1, 1, 'F');
    doc.roundedRect(10.1, 9, 8.8, 3.6, 1, 1, 'F');
    doc.setFillColor(LEAF);
    doc.circle(19.4, 16.6, 1.7, 'F');
  }

  doc.setTextColor(SLATE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(BRAND_NAME, 25, 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(TEAL);
  doc.text(BRAND_TAGLINE, 25, 16);

  // ── Title ───────────────────────────────────────────────────────
  doc.setDrawColor('#e2e8f0');
  doc.setLineWidth(0.2);
  doc.line(8, 24, CARD_W - 8, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(SLATE);
  doc.setCharSpace(0.6);
  doc.text('DIGITAL HEALTH CARD', 8, 31);
  doc.setCharSpace(0);

  // ── Fields (left column) ────────────────────────────────────────
  const field = (label: string, value: string, y: number, options?: { teal?: boolean; size?: number }) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(MUTED);
    doc.text(label.toUpperCase(), 8, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(options?.size ?? 9.5);
    doc.setTextColor(options?.teal ? TEAL : SLATE);
    const lines = doc.splitTextToSize(value, 62) as string[];
    doc.text(lines[0] ?? '—', 8, y + 4.6);
  };

  field('Patient Name', input.name || '—', 40);
  field('Health Card ID', input.healthCardId || '—', 50, { teal: true });
  const ageLine = [
    typeof input.age === 'number' ? `${input.age} yrs` : undefined,
    input.gender ? input.gender.charAt(0).toUpperCase() + input.gender.slice(1) : undefined,
  ].filter(Boolean).join(' • ');
  field('Age / Gender', ageLine || '—', 60);
  field('Blood Group', input.bloodGroup || 'Not recorded', 70, { size: 9 });

  // ── Fields (right column) ───────────────────────────────────────
  const fieldRight = (label: string, value: string, y: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(MUTED);
    doc.text(label.toUpperCase(), 76, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(SLATE);
    const lines = doc.splitTextToSize(value, 36) as string[];
    doc.text(lines.slice(0, 2), 76, y + 4.4, { lineHeightFactor: 1.15 });
  };

  const address = [input.village, input.district].filter(Boolean).join(', ');
  fieldRight('Registered Facility', input.facilityName || 'Not recorded', 40);
  fieldRight('Village / District', address || '—', 52);
  fieldRight('Emergency Contact', input.emergencyContact || input.phone || 'Not recorded', 64);

  // ── QR (reference only) ─────────────────────────────────────────
  const qrSize = 26;
  const qrX = CARD_W - 8 - qrSize;
  const qrY = 58;
  doc.setDrawColor('#e2e8f0');
  doc.roundedRect(qrX - 1.5, qrY - 1.5, qrSize + 3, qrSize + 3, 1.5, 1.5, 'S');
  try {
    const qr = await QRCodeEncoder.toDataURL(healthCardQrPayload(input.healthCardId), {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 512,
      color: { dark: SLATE, light: '#ffffff' },
    });
    doc.addImage(qr, 'PNG', qrX, qrY, qrSize, qrSize);
  } catch {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(MUTED);
    doc.text('QR unavailable', qrX, qrY + qrSize / 2);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(SLATE);
  doc.text('SCAN FOR CARE ACCESS', qrX + qrSize / 2, qrY + qrSize + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(MUTED);

  // ── Footer ──────────────────────────────────────────────────────
  doc.setDrawColor('#e2e8f0');
  doc.line(8, CARD_H - 9, CARD_W - 8, CARD_H - 9);
  doc.setFontSize(6.5);
  doc.setTextColor(MUTED);
  doc.text(`Generated: ${today()}`, 8, CARD_H - 5);
  // Kept short on purpose: the card is only 120mm wide, so a long sentence here
  // would run into the generated date instead of staying inside the card.
  doc.text('QR: card reference only — record access is verified', CARD_W - 8, CARD_H - 5, { align: 'right' });

  return doc;
}

/** Build and save the patient's card. */
export async function downloadHealthCardPdf(input: HealthCardPdfInput): Promise<void> {
  const doc = await buildHealthCardPdf(input);
  doc.save(`aarogyalink-health-card-${safeFilePart(input.healthCardId)}.pdf`);
}
