// ============================================================================
// AarogyaLink — care authorization helpers (server side)
// ----------------------------------------------------------------------------
// Shared by the medical-report store (appReports.ts) and the Health Card /
// walk-in workflow (appCare.ts). Everything here reads the STORED collections
// and the caller's STORED session binding: nothing about the caller's role,
// hospital or patient access is taken from the request.
// ============================================================================

import { getAuthUserId } from '@convex-dev/auth/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { authorizedPatientIdsForHospital, parseEnvelope, serializeEnvelope } from './authz';

export type Ctx = QueryCtx | MutationCtx;
export type Record_ = Record<string, unknown>;

export function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null;
}

/**
 * What the scanner (or the typing box) produced → the Health Card reference it
 * means. A QR payload is never trusted as-is: the reference it resolves to is
 * looked up in the stored patient register, and the medical data behind it is
 * released only after the caller is authorized.
 */
export function healthCardReferenceFromScan(raw: string): string {
  const value = raw.trim();
  // Current payload: AAROGYALINK:HC:<healthCardId>
  if (/^aarogyalink/i.test(value) && value.includes(':')) {
    return value.slice(value.lastIndexOf(':') + 1).trim();
  }
  // Legacy payload: AAROGYALINK|<healthCardId>|<patientId>
  if (value.includes('|')) {
    const parts = value.split('|').map(part => part.trim()).filter(Boolean);
    return parts[1] ?? parts[0] ?? '';
  }
  return value;
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** The caller's stored session binding (role / hospital / patient). */
export interface CareBinding {
  role: string;
  districtId?: string;
  districtName?: string;
  hospitalId?: string;
  staffUserId?: string;
  patientId?: string;
  name?: string;
  username?: string;
}

export async function requireBinding(ctx: Ctx): Promise<CareBinding> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error('Not authenticated: sign in to access AarogyaLink patient records.');
  }
  const binding = await ctx.db
    .query('authSessions')
    .withIndex('by_user', q => q.eq('convexUserId', userId))
    .first();
  if (!binding) {
    throw new Error('No session binding: sign in again to access AarogyaLink patient records.');
  }
  return binding as CareBinding;
}

export async function readItems(ctx: Ctx, key: string): Promise<unknown[]> {
  const row = await ctx.db.query('collections').withIndex('by_key', q => q.eq('key', key)).unique();
  return parseEnvelope(row?.data)?.items ?? [];
}

/**
 * Write a collection back, keeping the dataset version the app is using. A
 * different version would read as "first write of a new dataset" in appData.ts
 * and be accepted unscoped, so the version must never change here.
 */
export async function writeItems(ctx: MutationCtx, key: string, items: unknown[]): Promise<void> {
  const row = await ctx.db.query('collections').withIndex('by_key', q => q.eq('key', key)).unique();
  const version = parseEnvelope(row?.data)?.v ?? '1';
  const data = serializeEnvelope(version, items);
  if (row) await ctx.db.patch(row._id, { data, updatedAt: Date.now() });
  else await ctx.db.insert('collections', { key, data, updatedAt: Date.now() });
}

/** Patient ids whose Health Card was scanned at this hospital (walk-ins). */
export async function grantedPatientIds(ctx: Ctx, hospitalId: string): Promise<Set<string>> {
  const rows = await ctx.db
    .query('careAccessGrants')
    .withIndex('by_hospital', q => q.eq('hospitalId', hospitalId))
    .collect();
  return new Set(rows.map(row => row.patientId));
}

/**
 * Every patient id the bound caller may open a clinical record for: their own
 * hospital's register, patients referred/booked into it, and walk-in patients
 * whose Health Card was scanned there.
 */
export async function authorizedPatientsFor(ctx: Ctx, binding: CareBinding): Promise<Set<string>> {
  if (binding.role === 'patient' && binding.patientId) return new Set([binding.patientId]);
  const hospitalId = binding.hospitalId;
  if (!hospitalId) return new Set();
  const [patients, referrals, appointments, grants] = await Promise.all([
    readItems(ctx, 'patients'),
    readItems(ctx, 'referrals'),
    readItems(ctx, 'appointments'),
    grantedPatientIds(ctx, hospitalId),
  ]);
  return authorizedPatientIdsForHospital(patients, referrals, appointments, hospitalId, grants);
}

/** Roles allowed to work the patient record behind a scanned Health Card. */
export function isCareStaff(binding: CareBinding): boolean {
  return binding.role === 'doctor' || binding.role === 'hospital_admin';
}

export interface EncounterRecord {
  vitals: unknown[];
  reports: unknown[];
  consultations: unknown[];
  referrals: unknown[];
  followups: unknown[];
}

/** Newest-first ordering, tolerant of both ISO timestamps and YYYY-MM-DD days. */
function byDescendingDate(field: string) {
  return (a: unknown, b: unknown) => {
    const av = isRecord(a) ? str(a[field]) ?? '' : '';
    const bv = isRecord(b) ? str(b[field]) ?? '' : '';
    return bv.localeCompare(av);
  };
}

/**
 * The longitudinal record for one patient: vitals, medical reports, previous
 * consultations, referral history and follow-ups. Only scoped by patientId —
 * the caller must already hold authorization for that patient.
 */
export async function encounterRecordFor(ctx: Ctx, patientId: string): Promise<EncounterRecord> {
  const [vitals, reports, consultations, referrals, followups] = await Promise.all([
    readItems(ctx, 'vitals'),
    readItems(ctx, 'medicalReports'),
    readItems(ctx, 'consultations'),
    readItems(ctx, 'referrals'),
    readItems(ctx, 'followups'),
  ]);
  const mine = (record: unknown) => isRecord(record) && str(record.patientId) === patientId;
  return {
    vitals: vitals.filter(mine).sort(byDescendingDate('date')),
    reports: reports.filter(mine).sort(byDescendingDate('reportDate')),
    consultations: consultations.filter(mine).sort(byDescendingDate('createdAt')),
    referrals: referrals.filter(mine).sort(byDescendingDate('updatedAt')),
    followups: followups.filter(mine).sort(byDescendingDate('scheduledDate')),
  };
}
