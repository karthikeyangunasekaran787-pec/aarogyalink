/**
 * Live end-to-end test of the Patient ID lookup + cross-health-worker edit.
 * Run with: bun scripts/tests/convex-patient-registry.ts
 *
 * It drives the REAL backend the app uses (convex/appPatient.ts) with real
 * server-bound sessions, and walks the acceptance list:
 *
 *   A. a health worker registers a patient at their facility
 *   B. a DIFFERENT health worker at the same facility finds it by Patient ID
 *   C. …and by Health Card ID, and opens the permitted details
 *   D. their correction is saved to the shared database
 *   E. the registering health worker sees the correction on their next read
 *   F. the Patient ID and Health Card ID are unchanged
 *   G. the patient's vitals, referrals and appointments are intact
 *   H. searching a nonexistent ID creates no patient
 *   I. an unauthorized caller (another facility's worker, or the patient
 *      themselves) cannot edit the record
 *   J. a worker in another district cannot even see it
 *   K. two concurrent edits cannot silently overwrite: the stale one is refused
 *   L. the audit trail names the user who made the change, with what changed
 *
 * It writes only its own test patient (plus one vitals reading, one appointment
 * and one referral to prove they survive an edit) and removes all of them again
 * at the end, so it leaves no test data behind.
 */
import { AnyApi, ConvexHttpClient } from 'convex/browser';

import { api } from '../../src/convex/_generated/api';
import { DATA_VERSION } from '../../src/contexts/cloudData';
import { staffUsers as demoStaff } from '../../src/lib/mock-data';

const url = process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('FAIL: VITE_CONVEX_URL is not set');
  process.exit(1);
}

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`(pass) ${name}`);
  else {
    failures++;
    console.error(`(FAIL) ${name}`, detail ?? '');
  }
}
function info(message: string) {
  console.log(`(info) ${message}`);
}

type Items = Record<string, unknown>[];
type Envelope = { v?: string; items: Items };

const s = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

async function device(): Promise<ConvexHttpClient> {
  const client = new ConvexHttpClient(url as string);
  const result = (await client.action(api.auth.signIn as AnyApi, {
    provider: 'anonymous',
  })) as { tokens?: { token: string } };
  const token = result?.tokens?.token;
  if (!token) throw new Error('anonymous sign-in returned no token');
  client.setAuth(token);
  return client;
}

/** One staff account, bound server-side to the role/hospital it is stored with. */
interface Session {
  label: string;
  client: ConvexHttpClient;
  staffUserId?: string;
  name?: string;
  role?: string;
}

async function bindStaff(label: string, username: string, password: string): Promise<Session | null> {
  const client = await device();
  const result = (await client.mutation(api.appSession.loginStaffSession as AnyApi, {
    username,
    password,
  })) as { ok?: boolean; user?: { id?: string; name?: string; role?: string } };
  if (!result?.ok) return null;
  return { label, client, staffUserId: result.user?.id, name: result.user?.name, role: result.user?.role };
}

/** The raw stored payload of one collection, including its data version. */
async function readEnvelope(client: ConvexHttpClient, key: string): Promise<Envelope> {
  const all = (await client.query(api.appData.getAll as AnyApi, {})) as Record<string, unknown>;
  const raw = all[key];
  if (typeof raw !== 'string') return { items: [] };
  const parsed = JSON.parse(raw) as Envelope;
  return { v: parsed.v, items: Array.isArray(parsed.items) ? parsed.items : [] };
}

async function readItems(client: ConvexHttpClient, key: string): Promise<Items> {
  return (await readEnvelope(client, key)).items;
}

/**
 * Write a whole collection back the way the app does. Only safe when the stored
 * payload was written with the SAME data version: a different version reads as
 * "first write of a new dataset" and is accepted unscoped, which would replace
 * other districts' rows with this caller's slice. So every write is version-
 * checked first.
 */
async function writeCollection(
  session: Session,
  key: string,
  items: unknown[],
): Promise<{ written: boolean; reason?: string }> {
  const stored = await readEnvelope(session.client, key);
  if (stored.v !== DATA_VERSION) {
    return { written: false, reason: `stored version ${stored.v ?? 'none'} != ${DATA_VERSION}` };
  }
  const result = (await session.client.mutation(api.appData.saveCollection as AnyApi, {
    key,
    data: JSON.stringify({ v: DATA_VERSION, items }),
  })) as { written?: boolean; reason?: string };
  return { written: result?.written === true, reason: result?.reason };
}

interface LookupResult {
  ok?: boolean;
  reason?: string;
  patient?: Record<string, unknown>;
  canEdit?: boolean;
  accessSource?: string;
  editHistory?: Record<string, unknown>[];
  message?: string;
}

interface SaveResult {
  ok?: boolean;
  reason?: string;
  patient?: Record<string, unknown>;
  entry?: Record<string, unknown>;
  errors?: { field?: string; code?: string }[];
  message?: string;
}

async function lookup(session: Session, code: string): Promise<LookupResult> {
  return (await session.client.query(api.appPatient.findPatientRecord as AnyApi, {
    code,
  })) as LookupResult;
}

async function saveEdit(
  session: Session,
  args: {
    patientId: string;
    draft: Record<string, unknown>;
    expectedVersion: number;
    reason?: string;
    idempotencyKey?: string;
  },
): Promise<SaveResult> {
  return (await session.client.mutation(api.appPatient.updatePatientDemographics as AnyApi, args)) as SaveResult;
}

const findH1Worker = demoStaff.find(u => u.role === 'health_worker' && u.facilityId === 'h1' && u.password);
const findH1Admin = demoStaff.find(u => u.role === 'hospital_admin' && u.facilityId === 'h1' && u.password);
const findH1Doctor = demoStaff.find(u => u.role === 'doctor' && u.facilityId === 'h1' && u.password);
const findForeignWorker = demoStaff.find(
  u => u.role === 'health_worker' && u.districtId === 'DIST-TRY' && u.facilityId && u.password,
);

try {
  if (!findH1Worker || !findH1Admin || !findH1Doctor || !findForeignWorker) {
    throw new Error('the demo fixtures do not carry the h1 / foreign staff accounts this test needs');
  }

  const workerA = await bindStaff('health worker A (h1)', findH1Worker.username!, findH1Worker.password!);
  const workerB = await bindStaff('colleague B (h1)', findH1Admin.username!, findH1Admin.password!);
  const doctor = await bindStaff('doctor (h1)', findH1Doctor.username!, findH1Doctor.password!);
  const outsider = await bindStaff('worker (other district)', findForeignWorker.username!, findForeignWorker.password!);
  check('health worker A binds to their own facility', workerA?.role === 'health_worker');
  check('colleague B at the same facility binds', workerB?.role === 'hospital_admin');
  check('a doctor at the same facility binds', doctor?.role === 'doctor');
  check('a worker in another district binds', outsider?.role === 'health_worker');
  if (!workerA || !workerB || !doctor || !outsider) throw new Error('cannot continue without the four sessions');

  // The stored dataset must be on the current data version, or a full-collection
  // write would be treated as a fresh seed. Never write blindly.
  const baselinePatients = await readEnvelope(workerA.client, 'patients');
  if (baselinePatients.v !== DATA_VERSION) {
    throw new Error(
      `the deployment stores patients with version ${baselinePatients.v ?? 'none'}, not ${DATA_VERSION}. ` +
        'Open the app once so it reseeds, then re-run this test.',
    );
  }

  const stamp = Date.now().toString(36).toUpperCase();
  const testPatientId = `plive-${stamp.toLowerCase()}`;
  const testCardId = `HC-LIVE-${stamp}`;
  const testVitalsId = `v-live-${stamp.toLowerCase()}`;
  const testAppointmentId = `a-live-${stamp.toLowerCase()}`;
  const testReferralId = `r-live-${stamp.toLowerCase()}`;
  const testReason = 'live test: patient gave a corrected mobile number';

  const beforePatients = baselinePatients.items;
  const beforeVitals = await readItems(workerA.client, 'vitals');
  const beforeAppointments = await readItems(workerA.client, 'appointments');
  const beforeReferrals = await readItems(workerA.client, 'referrals');
  const beforeReports = await readItems(workerA.client, 'medicalReports');

  // ── A) Health worker A registers a patient at their facility ─────
  const newPatient = {
    id: testPatientId,
    userId: `u-${testPatientId}`,
    healthCardId: testCardId,
    registeredByEmail: `${testPatientId}@patient.aarogyalink.in`,
    registeredAt: new Date().toISOString().slice(0, 10),
    name: 'Live Test Patient',
    age: 41,
    gender: 'female',
    phone: '9000000000',
    address: '1 Test Street',
    village: 'Testvillage',
    district: 'Pudukkottai',
    state: 'Tamil Nadu',
    bloodGroup: 'B+',
    emergencyContact: '9000000001',
    registeredByFacilityId: 'h1',
    registeredByName: workerA.name,
    registeredByUserId: workerA.staffUserId,
    registeredByRole: 'health_worker',
    recordVersion: 0,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  const created = await writeCollection(workerA, 'patients', [...beforePatients, newPatient]);
  check('A registers a patient at their own facility', created.written, created);

  // …with one vitals reading, one appointment and one referral, so that "an
  // edit does not touch clinical data" is a real assertion rather than a hope.
  const createdVitals = await writeCollection(workerA, 'vitals', [
    ...beforeVitals,
    { id: testVitalsId, patientId: testPatientId, recordedBy: 'Live Test', date: '2026-10-15', spO2: 96, heartRate: 78 },
  ]);
  const createdAppointment = await writeCollection(workerA, 'appointments', [
    ...beforeAppointments,
    {
      id: testAppointmentId, patientId: testPatientId, doctorId: 'd1', facilityId: 'h1',
      department: 'General Medicine', date: '2026-10-20', time: '10:00', status: 'scheduled',
      reason: 'Live test', createdAt: '2026-10-15',
    },
  ]);
  const createdReferral = await writeCollection(workerA, 'referrals', [
    ...beforeReferrals,
    {
      id: testReferralId, referralId: `REF-LIVE-${stamp}`, patientId: testPatientId,
      patientName: 'Live Test Patient', healthCardId: testCardId,
      sourceFacilityId: 'h1', sourceFacilityName: 'Test PHC', destinationFacilityId: 'h2',
      destinationFacilityName: 'Test Hospital', department: 'General Medicine', priority: 'routine',
      reason: 'Live test', status: 'created', currentStep: 1, totalSteps: 9, isOverdue: false,
      createdAt: '2026-10-15', updatedAt: '2026-10-15',
    },
  ]);
  check(
    'the test patient has a vitals reading, an appointment and a referral',
    createdVitals.written && createdAppointment.written && createdReferral.written,
    { createdVitals, createdAppointment, createdReferral },
  );

  const registered = await readItems(workerA.client, 'patients');
  const registeredRecord = registered.find(p => p.id === testPatientId);
  check('the registering worker sees the new patient in the register', !!registeredRecord);

  // ── B) Another health worker at the same facility, by Patient ID ──
  const byPatientId = await lookup(workerB, testPatientId.toUpperCase());
  check('B finds the patient registered by A, by Patient ID', byPatientId.ok === true && s(byPatientId.patient?.id) === testPatientId, byPatientId.message);
  check('B may edit the permitted details', byPatientId.canEdit === true);

  // ── C) …and by Health Card ID ────────────────────────────────────
  const byCardId = await lookup(workerB, testCardId.toLowerCase());
  check('B finds the SAME record by Health Card ID', s(byCardId.patient?.id) === testPatientId, byCardId);
  check('the verified record carries the fields the workflow asks for', !!(
    s(byCardId.patient?.name) && s(byCardId.patient?.healthCardId) && typeof byCardId.patient?.age === 'number'
  ), byCardId.patient);

  // ── F) The identifiers are reported unchanged, before any edit ────
  const originalId = s(byPatientId.patient?.id);
  const originalCard = s(byPatientId.patient?.healthCardId);

  // ── H) A search for a nonexistent ID creates nothing ─────────────
  const missing = await lookup(workerB, `NOPE-${stamp}`);
  const afterMissing = await readItems(workerA.client, 'patients');
  check('a nonexistent Patient ID reports no match', missing.ok === false && missing.reason === 'not_found', missing);
  check('searching created no patient', afterMissing.length === registered.length, afterMissing.length - registered.length);

  // ── J) Another district cannot see the patient at all ────────────
  const foreignLookup = await lookup(outsider, testPatientId.toUpperCase());
  check(
    'a worker in another district cannot look the patient up',
    foreignLookup.ok === false && !foreignLookup.patient,
    foreignLookup,
  );

  // ── I) Unauthorized callers cannot edit ─────────────────────────
  const foreignEdit = await saveEdit(outsider, {
    patientId: testPatientId,
    draft: { name: 'HIJACKED' },
    expectedVersion: 0,
  });
  check(
    'another district’s worker cannot edit the patient',
    foreignEdit.ok === false && foreignEdit.reason === 'forbidden',
    foreignEdit,
  );

  const doctorLookup = await lookup(doctor, testPatientId.toUpperCase());
  check('a doctor may look the record up but not edit it', doctorLookup.ok === true && doctorLookup.canEdit === false, doctorLookup.canEdit);
  const doctorEdit = await saveEdit(doctor, {
    patientId: testPatientId,
    draft: { name: 'DOCTOR-EDIT' },
    expectedVersion: 0,
  });
  check(
    'a doctor’s edit is refused by the backend',
    doctorEdit.ok === false && doctorEdit.reason === 'forbidden',
    doctorEdit,
  );

  // The patient themselves: a patient session may read their own record but
  // must not be able to rewrite the registration details.
  const patientClient = await device();
  const patientLogin = (await patientClient.mutation(api.appSession.loginPatientSession as AnyApi, {
    email: `${testPatientId}@patient.aaralink.in`.replace('aaralink', 'aarogyalink'),
    healthCardId: testCardId,
  })) as { ok?: boolean };
  if (patientLogin?.ok) {
    const patientEdit = (await patientClient.mutation(api.appPatient.updatePatientDemographics as AnyApi, {
      patientId: testPatientId,
      draft: { name: 'PATIENT-EDIT' },
      expectedVersion: 0,
    })) as SaveResult;
    check('the patient cannot edit their own registration record', patientEdit.ok === false, patientEdit);
  } else {
    info('the test patient cannot sign in as a patient session — skipping that refusal check');
  }

  // ── D + L) B edits the permitted details; the audit trail records it ──
  const edit = await saveEdit(workerB, {
    patientId: testPatientId,
    draft: { name: 'Live Test Patient (corrected)', phone: '9111111111', village: 'Newvillage' },
    expectedVersion: 0,
    reason: testReason,
    idempotencyKey: `live-${stamp}`,
  });
  check('B’s edit is saved', edit.ok === true, edit.message);
  const edited = edit.patient;
  check('the edited values are stored on the shared record', s(edited?.phone) === '9111111111' && s(edited?.village) === 'Newvillage');
  check('the record version advanced', edited?.recordVersion === 1, edited?.recordVersion);

  // ── F) Patient ID and Health Card ID are immutable ───────────────
  check('the Patient ID is unchanged', s(edited?.id) === originalId, { before: originalId, after: edited?.id });
  check('the Health Card ID is unchanged', s(edited?.healthCardId) === originalCard);

  // ── L) The audit entry names the real editor, not the registrar ──
  const entry = (edited?.editHistory as Record<string, unknown>[] | undefined)?.slice(-1)[0];
  check('the audit trail was written', !!entry, edited?.editHistory);
  check('the audit trail names the health worker who made the change', s(entry?.editedByName) === workerB.name, {
    expected: workerB.name, entry,
  });
  check('the audit trail records that user’s id', s(entry?.editedByUserId) === workerB.staffUserId, entry?.editedByUserId);
  check('the audit trail records the reason', s(entry?.reason) === testReason, entry?.reason);
  const changes = (entry?.changes as { field?: string; from?: string; to?: string }[] | undefined) ?? [];
  const phoneChange = changes.find(c => c.field === 'phone');
  check(
    'the audit trail records previous and updated values',
    phoneChange?.from === '9000000000' && phoneChange?.to === '9111111111',
    phoneChange,
  );
  check('the ORIGINAL registering worker is still on the record', s(edited?.registeredByName) === workerA.name, edited?.registeredByName);

  // ── E) The registering worker sees the update on their next read ──
  const reReadByA = await lookup(workerA, testPatientId.toUpperCase());
  check('A sees B’s correction after refreshing', s(reReadByA.patient?.phone) === '9111111111', reReadByA.patient?.phone);
  check('A sees the audit trail too', (reReadByA.editHistory?.length ?? 0) >= 1);

  // ── K) Concurrent edits cannot silently overwrite ────────────────
  const [raceA, raceB] = await Promise.all([
    saveEdit(workerA, { patientId: testPatientId, draft: { phone: '9222222222' }, expectedVersion: 1, reason: 'live test: race A' }),
    saveEdit(workerB, { patientId: testPatientId, draft: { phone: '9333333333' }, expectedVersion: 1, reason: 'live test: race B' }),
  ]);
  const wins = [raceA, raceB].filter(result => result.ok === true);
  const losses = [raceA, raceB].filter(result => result.ok === false);
  check('exactly one of two concurrent edits is accepted', wins.length === 1 && losses.length === 1, { raceA: raceA.reason, raceB: raceB.reason });
  check('the refused edit reports the conflict', losses[0]?.reason === 'stale', losses[0]);
  const afterRace = await lookup(workerB, testPatientId.toUpperCase());
  const winnerPhone = s(wins[0]?.patient?.phone);
  check('the accepted edit is what is stored', s(afterRace.patient?.phone) === winnerPhone, {
    stored: afterRace.patient?.phone, winner: winnerPhone,
  });
  check('no edit was lost silently — the version moved exactly twice after race', afterRace.patient?.recordVersion === 2, afterRace.patient?.recordVersion);

  // ── G) Clinical data survived every edit ────────────────────────
  const vitalsAfter = await readItems(workerA.client, 'vitals');
  const appointmentsAfter = await readItems(workerA.client, 'appointments');
  const referralsAfter = await readItems(workerA.client, 'referrals');
  const reportsAfter = await readItems(workerA.client, 'medicalReports');
  const vitalsRow = vitalsAfter.find(v => v.id === testVitalsId);
  check('the patient’s vitals reading is intact', vitalsRow?.spO2 === 96 && s(vitalsRow?.patientId) === testPatientId, vitalsRow);
  check('the patient’s appointment is intact', appointmentsAfter.some(a => a.id === testAppointmentId && s(a.patientId) === testPatientId));
  check('the patient’s referral is intact', referralsAfter.some(r => r.id === testReferralId && s(r.patientId) === testPatientId));
  check(
    'no other clinical record was added or removed',
    vitalsAfter.length === beforeVitals.length + 1 &&
      appointmentsAfter.length === beforeAppointments.length + 1 &&
      referralsAfter.length === beforeReferrals.length + 1 &&
      reportsAfter.length === beforeReports.length,
    {
      vitals: [beforeVitals.length, vitalsAfter.length],
      appointments: [beforeAppointments.length, appointmentsAfter.length],
      referrals: [beforeReferrals.length, referralsAfter.length],
      reports: [beforeReports.length, reportsAfter.length],
    },
  );

  // ── Clean up: remove everything this test created ───────────────
  const cleanupPatients = (await readItems(workerA.client, 'patients')).filter(p => p.id !== testPatientId);
  const cleanupVitals = (await readItems(workerA.client, 'vitals')).filter(v => v.id !== testVitalsId);
  const cleanupAppointments = (await readItems(workerA.client, 'appointments')).filter(a => a.id !== testAppointmentId);
  const cleanupReferrals = (await readItems(workerA.client, 'referrals')).filter(r => r.id !== testReferralId);
  const removed = await Promise.all([
    writeCollection(workerA, 'patients', cleanupPatients),
    writeCollection(workerA, 'vitals', cleanupVitals),
    writeCollection(workerA, 'appointments', cleanupAppointments),
    writeCollection(workerA, 'referrals', cleanupReferrals),
  ]);
  const finalPatients = await readItems(workerA.client, 'patients');
  check(
    'the test patient and its clinical rows were removed again',
    removed.every(result => result.written) &&
      !finalPatients.some(p => p.id === testPatientId) &&
      (await readItems(workerA.client, 'vitals')).length === beforeVitals.length &&
      (await readItems(workerA.client, 'referrals')).length === beforeReferrals.length,
    { removed, finalPatients: finalPatients.length, before: beforePatients.length },
  );
} catch (err) {
  failures++;
  console.error('(FAIL) unexpected error:', err);
}

console.log(failures === 0 ? '\nAll live patient-registry tests passed.' : `\n${failures} live patient-registry test(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
