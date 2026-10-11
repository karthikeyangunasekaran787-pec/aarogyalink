// ============================================================================
// AarogyaLink — Health Card QR reference + medical report vocabulary
// ----------------------------------------------------------------------------
// The Health Card QR carries a REFERENCE, never medical data:
//
//     AAROGYALINK:HC:AL-PT-2026-001
//
// No name, no diagnosis, no prescription, no vitals. Everything behind that
// reference is released by the backend only after it has verified the caller
// and their authorization (see convex/appCare.ts).
//
// The parsing here mirrors `healthCardReferenceFromScan` in convex/appCare.ts:
// the backend re-parses whatever it receives, so a hand-crafted payload can
// never widen access — this side exists only to give immediate feedback.
// ============================================================================

import type { ReportType } from '@/types';

export const HEALTH_CARD_QR_PREFIX = 'AAROGYALINK:HC:';

/** The exact string encoded into a patient's Health Card QR. */
export function healthCardQrPayload(healthCardId: string): string {
  return `${HEALTH_CARD_QR_PREFIX}${healthCardId.trim().toUpperCase()}`;
}

/**
 * A scanned/typed value → the Health Card reference it means, or null.
 * Accepts the current payload, the legacy `AAROGYALINK|<card>|<patient>` form
 * and a bare card number.
 */
export function parseHealthCardQr(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^aarogyalink/i.test(value) && value.includes(':')) {
    const reference = value.slice(value.lastIndexOf(':') + 1).trim();
    return reference || null;
  }
  if (value.includes('|')) {
    const parts = value.split('|').map(part => part.trim()).filter(Boolean);
    return parts[1] ?? parts[0] ?? null;
  }
  return value;
}

/** Report types, in filter order. `all` is the unfiltered view. */
import type { TranslationKey } from '@/lib/i18n';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  lab_report: 'Lab Report',
  imaging: 'Imaging',
  prescription: 'Prescription',
  discharge_summary: 'Discharge Summary',
  medical_certificate: 'Medical Certificate',
  other: 'Other',
};

export type ReportFilterKey = 'all' | ReportType;

/**
 * Translation key for a report type. The English labels above stay the source
 * of truth for data/reports, while the UI resolves the key so a report type is
 * shown in the selected language.
 */
export const REPORT_TYPE_KEYS: Record<ReportType, TranslationKey> = {
  lab_report: 'reportTypeLabReport',
  imaging: 'reportTypeImaging',
  prescription: 'reportTypePrescription',
  discharge_summary: 'reportTypeDischarge',
  medical_certificate: 'reportTypeCertificate',
  other: 'reportTypeOther',
};

/** Translation key for each report filter chip ("all" reuses the All label). */
export const REPORT_FILTER_KEYS: Record<ReportFilterKey, TranslationKey> = {
  all: 'all',
  lab_report: 'filterLabReports',
  imaging: 'reportTypeImaging',
  prescription: 'filterPrescriptions',
  discharge_summary: 'filterDischarge',
  medical_certificate: 'reportTypeCertificate',
  other: 'reportTypeOther',
};

export function reportTypeKey(type: ReportType | string): TranslationKey {
  return REPORT_TYPE_KEYS[type as ReportType] ?? 'reportName';
}

export const REPORT_FILTERS: { key: ReportFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'lab_report', label: 'Lab Reports' },
  { key: 'imaging', label: 'Imaging' },
  { key: 'prescription', label: 'Prescriptions' },
  { key: 'discharge_summary', label: 'Discharge Summaries' },
  { key: 'other', label: 'Other' },
];

/** Report types offered in the upload form (all of them, with other last). */
export const REPORT_TYPE_ORDER: ReportType[] = [
  'lab_report',
  'imaging',
  'prescription',
  'discharge_summary',
  'medical_certificate',
  'other',
];

export function reportTypeLabel(type: ReportType | string): string {
  return REPORT_TYPE_LABELS[type as ReportType] ?? 'Report';
}

/** Human date for report rows: 08 Oct 2026. */
export function formatReportDate(value: string | undefined): string {
  if (!value) return '—';
  const iso = value.length > 10 ? value.slice(0, 10) : value;
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return value;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(day).padStart(2, '0')} ${months[month - 1]} ${year}`;
}

/** Year a report belongs to, for the chronological grouping. */
export function reportYear(report: { reportDate?: string }): string {
  return (report.reportDate ?? '').slice(0, 4) || 'Undated';
}

/** Human file size for the report metadata row. */
export function formatFileSize(bytes: number | undefined): string | undefined {
  if (!bytes || bytes <= 0) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
