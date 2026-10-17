// ============================================================================
// AarogyaLink — Patient registry hook (Patient ID lookup + audited edit)
// ----------------------------------------------------------------------------
// One hook behind the "Find Existing Patient" workflow on the Health Worker
// dashboard. It answers the two questions the screen asks:
//
//   • findExistingPatient(code) — ONE record, resolved by the backend against
//     the caller's STORED authorization (never a global search). With no
//     backend session the device answers from its own already-scoped cache, so
//     the village workflow keeps working offline.
//   • savePatientEdit(...)      — the demographic correction, validated by the
//     SAME pure rules the backend uses, recorded with its audit entry, and
//     refused when the record moved on since it was loaded.
//
// The found record is a live subscription when the backend session is bound: a
// colleague's edit reaches this screen without a manual refresh.
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useApp } from '@/contexts/AppContext';
import { useBackendSession } from '@/hooks/use-backend-session';
import { uniqueRecordId, useData } from '@/contexts/DataContext';
import {
  findPatientByCode,
  isPlausiblePatientCode,
  normalizePatientCode,
  patientEditHistoryOf,
  patientEditVersionOf,
  planPatientEdit,
  serverDraftOf,
  validatePatientDraft,
} from '@/lib/patient-record';
import type { PatientDraft, PatientFieldError } from '@/lib/patient-record';
import type { Appointment, Patient, PatientEditEntry, Referral, Role } from '@/types';

/** Where the record came from, so the screen can explain why it is visible. */
export type PatientAccessSource =
  | 'facility_register'
  | 'referral'
  | 'appointment'
  | 'health_card'
  | 'platform';

export type PatientLookupState =
  | 'idle'
  | 'searching'
  | 'found'
  /** The Patient ID is not the shape of a real id (typing mistake). */
  | 'invalid'
  /** No such patient inside the caller's authorized facility/district. */
  | 'not_found'
  /** The signed-in role may not look patients up at all. */
  | 'forbidden'
  /** The backend could not be reached, and the device has no cached register. */
  | 'error';

export interface PatientLookup {
  state: PatientLookupState;
  patient: Patient | null;
  /** Whether THIS caller may correct the record (permission-denied otherwise). */
  canEdit: boolean;
  editHistory: PatientEditEntry[];
  accessSource?: PatientAccessSource;
  /** Staff-facing explanation for the current state. */
  message?: string;
  /** True when the answer came from this device's cached register. */
  offline: boolean;
}

export interface PatientSaveResult {
  ok: boolean;
  message: string;
  errors?: PatientFieldError[];
  /** True when somebody else saved a newer edit first. */
  conflict?: boolean;
  offline?: boolean;
}

/** Roles allowed to correct demographic details (mirrors the backend policy). */
const EDIT_ROLES: ReadonlySet<Role> = new Set<Role>(['health_worker', 'hospital_admin']);
/** Roles allowed to look a patient up at all. */
const LOOKUP_ROLES: ReadonlySet<Role> = new Set<Role>([
  'health_worker',
  'doctor',
  'hospital_admin',
  'overall_admin',
]);

/**
 * Is this cached patient inside the device's own authorization? The device's
 * cache is a scoped copy of the shared register, so ownership or an explicit
 * referral/appointment/scan link is what makes a patient reachable. Used only
 * for the offline fallback; with a backend session the server decides.
 */
export function isPatientInLocalScope(
  patient: Patient,
  context: { facilityId?: string; referrals: Referral[]; appointments: Appointment[] },
): boolean {
  const owner = patient.registeredByFacilityId;
  // Unattributed (seeded/legacy) records are shared reference data.
  if (!owner || owner === context.facilityId) return true;
  if (context.referrals.some(r => r.patientId === patient.id
    && (r.sourceFacilityId === context.facilityId || r.destinationFacilityId === context.facilityId))) return true;
  return context.appointments.some(a => a.patientId === patient.id && a.facilityId === context.facilityId);
}

interface LookupResponse {
  ok: boolean;
  reason?: 'invalid_code' | 'not_found' | 'forbidden';
  patient?: Patient;
  accessSource?: PatientAccessSource;
  canEdit?: boolean;
  editHistory?: PatientEditEntry[];
  message?: string;
}

interface SaveResponse {
  ok: boolean;
  reason?: 'forbidden' | 'not_found' | 'invalid_request' | 'stale' | 'payload_too_large';
  patient?: Patient;
  errors?: PatientFieldError[];
  message?: string;
}

const NOT_FOUND_MESSAGE =
  'No patient with that ID is available in your authorized facility or district. Searching never registers a patient.';
const INVALID_MESSAGE =
  'Enter a valid Patient ID (for example P1) or Health Card ID (HC-2026-0001).';
const FORBIDDEN_MESSAGE = 'Unauthorized: only hospital staff can look up patient records.';

export function usePatientRegistry() {
  const session = useBackendSession();
  const bound = session !== undefined && session !== null;
  const { currentUser, isOffline } = useApp();
  const { patients, referrals, appointments, updatePatientRecord } = useData();
  // The authoritative register lives on the backend, so a bound-but-offline
  // device answers from its own already-scoped cache — and says so.
  const reachable = bound && !isOffline;

  const [submitted, setSubmitted] = useState<string | null>(null);
  const [rejected, setRejected] = useState<{ state: PatientLookupState; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updatePatientMutation = useMutation(api.appPatient.updatePatientDemographics);

  // Bound: the backend resolves the code against the STORED authorization. The
  // query is reactive, so a colleague's edit appears here without a refresh.
  const response = useQuery(
    api.appPatient.findPatientRecord,
    reachable && submitted && !rejected ? { code: submitted } : 'skip',
  ) as LookupResponse | undefined;

  // Offline / unbound: answer from this device's already-scoped register.
  const cachedMatch = useMemo(() => {
    if (reachable || !submitted || rejected) return null;
    if (!LOOKUP_ROLES.has((currentUser?.role ?? 'patient') as Role)) return null;
    const found = findPatientByCode(patients, submitted);
    if (!found) return null;
    return isPatientInLocalScope(found, {
      facilityId: currentUser?.facilityId,
      referrals,
      appointments,
    })
      ? found
      : null;
  }, [reachable, submitted, rejected, patients, referrals, appointments, currentUser?.role, currentUser?.facilityId]);

  const lookup = useMemo<PatientLookup>(() => {
    if (!submitted) {
      return { state: 'idle', patient: null, canEdit: false, editHistory: [], offline: false };
    }
    if (rejected) {
      return { state: rejected.state, patient: null, canEdit: false, editHistory: [], message: rejected.message, offline: false };
    }

    const role = (currentUser?.role ?? 'patient') as Role;

    if (!bound) {
      const offline = true;
      if (!LOOKUP_ROLES.has(role)) {
        return { state: 'forbidden', patient: null, canEdit: false, editHistory: [], message: FORBIDDEN_MESSAGE, offline };
      }
      if (!cachedMatch) {
        return { state: 'not_found', patient: null, canEdit: false, editHistory: [], message: NOT_FOUND_MESSAGE, offline };
      }
      return {
        state: 'found',
        patient: cachedMatch,
        canEdit: EDIT_ROLES.has(role),
        editHistory: patientEditHistoryOf(cachedMatch, 10),
        offline,
        message: 'Record read from this device’s cached register — reconnect to confirm it against the shared register.',
      };
    }

    // Bound, but the device is offline right now. The cached register can still
    // answer for a patient it already holds; it must NOT claim "no such
    // patient" for one it simply cannot reach.
    if (isOffline) {
      if (!LOOKUP_ROLES.has(role)) {
        return { state: 'forbidden', patient: null, canEdit: false, editHistory: [], message: FORBIDDEN_MESSAGE, offline: true };
      }
      if (!cachedMatch) {
        return {
          state: 'error',
          patient: null,
          canEdit: false,
          editHistory: [],
          message: 'The patient register could not be reached. Check your connection and search again.',
          offline: true,
        };
      }
      return {
        state: 'found',
        patient: cachedMatch,
        canEdit: EDIT_ROLES.has(role),
        editHistory: patientEditHistoryOf(cachedMatch, 10),
        offline: true,
        message: 'Record read from this device’s cached register — reconnect to confirm it against the shared register.',
      };
    }

    if (response === undefined) {
      return { state: 'searching', patient: null, canEdit: false, editHistory: [], offline: false };
    }
    if (!response.ok || !response.patient) {
      const state: PatientLookupState =
        response.reason === 'invalid_code' ? 'invalid' : response.reason === 'forbidden' ? 'forbidden' : 'not_found';
      return {
        state,
        patient: null,
        canEdit: false,
        editHistory: [],
        message:
          response.message ??
          (state === 'invalid' ? INVALID_MESSAGE : state === 'forbidden' ? FORBIDDEN_MESSAGE : NOT_FOUND_MESSAGE),
        offline: false,
      };
    }
    return {
      state: 'found',
      patient: response.patient,
      canEdit: response.canEdit ?? EDIT_ROLES.has(role),
      editHistory: response.editHistory ?? patientEditHistoryOf(response.patient, 10),
      accessSource: response.accessSource,
      message: response.message,
      offline: false,
    };
  }, [submitted, rejected, bound, isOffline, response, cachedMatch, currentUser?.role]);

  /** Submit a typed Patient ID / Health Card ID for lookup. */
  const search = useCallback((rawCode: string) => {
    const code = normalizePatientCode(rawCode);
    if (!code) {
      setSubmitted(null);
      setRejected(null);
      return;
    }
    if (!isPlausiblePatientCode(code)) {
      setSubmitted(code);
      setRejected({ state: 'invalid', message: INVALID_MESSAGE });
      return;
    }
    setRejected(null);
    setSubmitted(code);
  }, []);

  const reset = useCallback(() => {
    setSubmitted(null);
    setRejected(null);
  }, []);

  /**
   * Save a demographic correction. The backend validates and records it when a
   * session is bound; otherwise the same pure rules are applied to this device's
   * record and the change syncs with the rest of the collection.
   */
  const savePatientEdit = useCallback(
    async (patient: Patient, draft: PatientDraft, reason?: string): Promise<PatientSaveResult> => {
      const role = (currentUser?.role ?? 'patient') as Role;
      if (!EDIT_ROLES.has(role)) {
        return {
          ok: false,
          message: 'Unauthorized: your role cannot change patient registration details.',
        };
      }

      // Same rules the backend enforces, applied first so the form answers
      // immediately (the server re-validates — the client check is not the
      // control).
      const clientErrors = validatePatientDraft(patient, draft);
      if (clientErrors.length > 0) {
        return {
          ok: false,
          message: clientErrors[0]?.message ?? 'The changes could not be saved.',
          errors: clientErrors,
          conflict: clientErrors.some(error => error.code === 'stale'),
        };
      }

      setIsSaving(true);
      try {
        if (reachable) {
          let result: SaveResponse;
          try {
            result = (await updatePatientMutation({
              patientId: patient.id,
              draft: serverDraftOf(draft),
              expectedVersion: patientEditVersionOf(patient),
              reason: reason?.trim() || undefined,
              // Stable across the client's own retry of this request, so a
              // retried save cannot record the edit twice.
              idempotencyKey: uniqueRecordId('save-'),
            })) as unknown as SaveResponse;
          } catch {
            return {
              ok: false,
              message: 'Network unavailable — the patient record was not changed. Reconnect and save again.',
            };
          }
          if (!result.ok) {
            return {
              ok: false,
              message: result.message ?? 'The changes could not be saved.',
              errors: result.errors,
              conflict: result.reason === 'stale',
            };
          }
          if (result.patient) updatePatientRecord(result.patient);
          return { ok: true, message: result.message ?? 'Patient details updated.' };
        }

        // Offline: apply the identical rules locally and let the collection sync.
        const plan = planPatientEdit({
          patient,
          draft,
          actor: {
            userId: currentUser?.id,
            name: currentUser?.name ?? 'Health worker',
            role,
            facilityId: currentUser?.facilityId,
          },
          expectedVersion: patientEditVersionOf(patient),
          reason,
          now: new Date().toISOString(),
          entryId: uniqueRecordId('pe-'),
        });
        if (!plan.ok) {
          return {
            ok: false,
            message: plan.errors[0]?.message ?? 'The changes could not be saved.',
            errors: plan.errors,
            conflict: plan.errors.some(error => error.code === 'stale'),
          };
        }
        updatePatientRecord(plan.patient);
        return {
          ok: true,
          offline: true,
          message:
            'Patient details saved on this device. They sync to the shared record when you are back online, without creating a second patient.',
        };
      } finally {
        setIsSaving(false);
      }
    },
    [reachable, currentUser, updatePatientMutation, updatePatientRecord],
  );

  return { lookup, search, reset, savePatientEdit, isSaving, backendBound: reachable };
}
