// ============================================================================
// AarogyaLink — Medical Report store (server-authoritative)
// ----------------------------------------------------------------------------
// A patient's reports are their longitudinal history, so this store is strictly
// APPEND-ONLY: `saveMedicalReport` always creates a new record and never touches
// an existing one, and nothing here exposes a delete.
//
//   • the FILE goes to Convex file storage (never into the record);
//   • the METADATA row goes into the shared `medicalReports` collection, so it
//     syncs to every device the way the other collections do;
//   • authorization is decided from the STORED session binding and the STORED
//     patient record — a health worker may only upload for a patient their
//     hospital is responsible for, and a file may only be read by the patient,
//     the platform administrator, or a hospital authorized for that patient.
// ============================================================================

import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { payloadFits } from './authz';
import {
  authorizedPatientsFor,
  encounterRecordFor,
  isRecord,
  readItems,
  requireBinding,
  str,
  writeItems,
  type CareBinding,
  type Ctx,
} from './careAuthz';

/** Roles that may add a report to a patient's record. */
const UPLOADER_ROLES = new Set(['health_worker', 'hospital_admin', 'doctor']);

const REPORT_TYPES = [
  'lab_report',
  'imaging',
  'prescription',
  'discharge_summary',
  'medical_certificate',
  'other',
] as const;

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

function uploadDeniedReason(binding: CareBinding): string | null {
  if (!UPLOADER_ROLES.has(binding.role)) {
    return 'Unauthorized: only hospital staff can upload medical reports.';
  }
  if (!binding.hospitalId) {
    return 'Unauthorized: your account is not linked to a hospital.';
  }
  return null;
}

/** Facility display name for the uploading hospital. */
async function facilityNameOf(ctx: Ctx, hospitalId?: string): Promise<string | undefined> {
  if (!hospitalId) return undefined;
  const hospitals = await readItems(ctx, 'hospitals');
  const match = hospitals.find(h => isRecord(h) && str(h.id) === hospitalId);
  return isRecord(match) ? str(match.name) : undefined;
}

/**
 * Upload ticket for the report file. The client PUTs the bytes to the returned
 * URL and gets back a storage id; the metadata write below is what actually
 * attaches it to a patient.
 */
export const generateReportUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    const binding = await requireBinding(ctx);
    const denied = uploadDeniedReason(binding);
    if (denied) throw new Error(denied);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Attach an uploaded file to a patient as a new report.
 *
 * The patient must be one this hospital is authorized for (registered here,
 * referred or booked in, or a walk-in whose Health Card was scanned here). The
 * uploader, their role and the facility come from the STORED binding, so the
 * client cannot attribute a report to somebody else.
 */
export const saveMedicalReport = mutation({
  args: {
    patientId: v.string(),
    title: v.string(),
    type: v.string(),
    reportDate: v.string(),
    storageId: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    fileSize: v.optional(v.number()),
    notes: v.optional(v.string()),
    /** Idempotency key, so a retried upload cannot store the report twice. */
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const binding = await requireBinding(ctx);
    const denied = uploadDeniedReason(binding);
    if (denied) return { ok: false as const, reason: 'forbidden' as const, message: denied };

    const title = args.title.trim();
    if (!title) {
      return { ok: false as const, reason: 'invalid_request' as const, message: 'A report title is required.' };
    }
    if (!(REPORT_TYPES as readonly string[]).includes(args.type)) {
      return { ok: false as const, reason: 'invalid_request' as const, message: 'Choose a valid report type.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.reportDate)) {
      return { ok: false as const, reason: 'invalid_request' as const, message: 'A valid report date is required.' };
    }
    if (typeof args.fileSize === 'number' && args.fileSize > MAX_FILE_BYTES) {
      return { ok: false as const, reason: 'file_too_large' as const, message: 'That file is larger than the 25 MB limit.' };
    }
    if (args.storageId.startsWith('http')) {
      // A storage id, never a URL — otherwise anyone could point a report at an
      // arbitrary location.
      return { ok: false as const, reason: 'invalid_request' as const, message: 'The uploaded file reference is invalid.' };
    }

    const patients = await readItems(ctx, 'patients');
    const patient = patients.find(p => isRecord(p) && str(p.id) === args.patientId);
    if (!isRecord(patient)) {
      return { ok: false as const, reason: 'not_found' as const, message: 'Patient not found.' };
    }

    const authorized = await authorizedPatientsFor(ctx, binding);
    if (!authorized.has(args.patientId)) {
      return {
        ok: false as const,
        reason: 'forbidden' as const,
        message: 'Unauthorized: this patient is not in your hospital’s care record.',
      };
    }

    const reports = await readItems(ctx, 'medicalReports');
    const now = new Date().toISOString();
    const healthCardId = str(patient.healthCardId) ?? '';

    if (args.idempotencyKey) {
      const existing = reports.find(
        r => isRecord(r) && str(r.idempotencyKey) === args.idempotencyKey && str(r.patientId) === args.patientId,
      );
      if (isRecord(existing)) {
        return { ok: true as const, duplicate: true as const, report: existing, message: 'This report was already uploaded.' };
      }
    }

    // Human-readable report id: RPT-<year>-<sequence within that year>.
    const year = args.reportDate.slice(0, 4);
    const sequence = reports.filter(r => isRecord(r) && str(r.reportId)?.startsWith(`RPT-${year}-`)).length + 1;
    const reportId = `RPT-${year}-${String(sequence).padStart(6, '0')}`;
    const id = args.idempotencyKey
      ? `mr-${args.patientId}-${args.idempotencyKey}`
      : `mr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const record = {
      id,
      reportId,
      patientId: args.patientId,
      healthCardId,
      title,
      type: args.type,
      reportDate: args.reportDate,
      uploadedAt: now,
      uploadedBy: binding.name || binding.username || 'AarogyaLink staff',
      uploadedByUserId: binding.staffUserId,
      uploadedByRole: binding.role,
      hospitalId: binding.hospitalId,
      facilityName: await facilityNameOf(ctx, binding.hospitalId),
      fileStorageId: args.storageId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      fileSize: args.fileSize,
      notes: args.notes?.trim() || undefined,
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };

    const next = [...reports, record];
    if (!payloadFits('1', next)) {
      return {
        ok: false as const,
        reason: 'payload_too_large' as const,
        message: 'The report store is too large to update — contact the platform administrator.',
      };
    }

    await writeItems(ctx, 'medicalReports', next);
    return { ok: true as const, duplicate: false as const, report: record, message: 'Report uploaded successfully.' };
  },
});

/**
 * A time-limited URL for one report file.
 *
 * Refuses unless the caller is the patient themselves, the platform
 * administrator, or hospital staff authorized for that patient (which includes
 * a walk-in whose Health Card was scanned). Hiding the button in the UI is not
 * the control — this is.
 *
 * A mutation rather than a query: this is an on-demand action taken when the
 * user presses View/Download, not reactive data.
 */
export const requestReportFileUrl = mutation({
  args: { reportId: v.string(), patientId: v.optional(v.string()) },
  handler: async (ctx, { reportId }) => {
    const binding = await requireBinding(ctx);

    // The patient-scoped read uses their own collection; everyone else is
    // checked against the stored patient set.
    const reports = binding.role === 'patient'
      ? (await encounterRecordFor(ctx, binding.patientId ?? '')).reports
      : await readItems(ctx, 'medicalReports');
    const report = reports.find(r => isRecord(r) && (str(r.id) === reportId || str(r.reportId) === reportId));
    if (!isRecord(report)) {
      return { ok: false as const, reason: 'not_found' as const, message: 'Report not found.' };
    }

    if (binding.role !== 'overall_admin' && binding.role !== 'patient') {
      const authorized = await authorizedPatientsFor(ctx, binding);
      if (!authorized.has(str(report.patientId) ?? '')) {
        return {
          ok: false as const,
          reason: 'forbidden' as const,
          message: 'Unauthorized: this patient is not in your hospital’s care record.',
        };
      }
    }

    const storageId = str(report.fileStorageId);
    if (!storageId) {
      return { ok: false as const, reason: 'no_file' as const, message: 'No file is attached to this report.' };
    }
    const url = await ctx.storage.getUrl(storageId as never);
    if (!url) {
      return { ok: false as const, reason: 'no_file' as const, message: 'The report file is no longer available.' };
    }
    return { ok: true as const, url, fileName: str(report.fileName) ?? 'report', mimeType: str(report.mimeType) ?? 'application/octet-stream' };
  },
});
