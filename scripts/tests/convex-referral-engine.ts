/**
 * Live Referral Closure Engine test against the deployed Convex deployment.
 * Run with: bun scripts/tests/convex-referral-engine.ts
 *
 * It does NOT just check that the UI shows a workflow: it drives a real referral
 * through the whole engine with the real demo accounts and re-reads the STORED
 * data after every step, asserting the backend actually moved:
 *
 *   CREATED → ACCEPTED → DOCTOR_ASSIGNED → SCHEDULED → ARRIVAL_VERIFIED
 *           → CONSULTATION_COMPLETED → TREATMENT_STARTED → FOLLOW_UP → CLOSED
 *
 * It also asserts the guarantees the demo depends on: only the receiving
 * hospital may accept/assign/schedule, a source hospital's doctor cannot be
 * assigned, a QR for another hospital is refused, an already-verified arrival
 * is refused, the collection path cannot skip the workflow, audit fields come
 * from the stored session (not the client), and a patient only sees their own
 * referral. The referral it creates is left in place as a demonstrable record
 * of a complete closure.
 */
import { AnyApi, ConvexHttpClient } from 'convex/browser';
import { api } from '../../src/convex/_generated/api';
import { DATA_VERSION } from '../../src/contexts/cloudData';

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

type Items = Record<string, unknown>[];
type Row = Record<string, unknown>;

const s = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

async function device(): Promise<ConvexHttpClient> {
  const client = new ConvexHttpClient(url);
  const result = (await client.action(api.auth.signIn as AnyApi, {
    provider: 'anonymous',
  })) as { tokens?: { token: string } };
  if (!result?.tokens?.token) throw new Error('anonymous sign-in returned no token');
  client.setAuth(result.tokens.token);
  return client;
}

async function read(client: ConvexHttpClient): Promise<Record<string, Items>> {
  const all = (await client.query(api.appData.getAll as AnyApi, {})) as Record<string, unknown>;
  const out: Record<string, Items> = {};
  for (const [key, raw] of Object.entries(all)) {
    if (typeof raw !== 'string') continue;
    const parsed = JSON.parse(raw) as { items?: unknown[] };
    if (Array.isArray(parsed.items)) out[key] = parsed.items as Items;
  }
  return out;
}

const payloadOf = (items: unknown[]) => JSON.stringify({ v: DATA_VERSION, items });

/** Log in a staff account and return a bound client. */
async function staffClient(username: string, password: string): Promise<{ client: ConvexHttpClient; user: Row } | null> {
  const client = await device();
  const result = (await client.mutation(api.appSession.loginStaffSession as AnyApi, {
    username,
    password,
  })) as { ok?: boolean; user?: Row };
  if (!result?.ok || !result.user) return null;
  return { client, user: result.user };
}

const trans = (client: ConvexHttpClient, args: Row) =>
  client.mutation(api.appReferral.transitionReferral as AnyApi, args as never) as Promise<
    Record<string, unknown>
  >;

/** Stored referral as seen by the district administrator (full district view). */
async function stored(observer: ConvexHttpClient, referralId: string): Promise<Row | undefined> {
  const data = await read(observer);
  return (data.referrals ?? []).find(r => s(r.id) === referralId);
}

async function storedEvents(observer: ConvexHttpClient, referralId: string): Promise<Row[]> {
  const data = await read(observer);
  return (data.referralEvents ?? []).filter(e => s(e.referralId) === referralId);
}

async function main() {
  // ── District (Trichy) observer + account discovery ───────────────
  const observer = await device();
  const districtBind = (await observer.mutation(api.appSession.loginDistrictSession as AnyApi, {
    username: 'distadmin_trichy',
  })) as { ok?: boolean };
  if (!districtBind?.ok) {
    console.error('FAIL: could not bind distadmin_trichy — run the app once so the fixtures are seeded');
    process.exit(1);
  }

  const view = await read(observer);
  const staff = view.staffUsers ?? [];
  const doctors = view.doctors ?? [];
  const hospitals = view.hospitals ?? [];
  const patients = view.patients ?? [];

  const hasCreds = (u: Row) => typeof u.username === 'string' && !!u.username && typeof u.password === 'string' && !!u.password;
  const staffAt = (hospitalId: string, role: string) =>
    staff.find(u => s(u.facilityId) === hospitalId && String(u.role) === role && hasCreds(u));

  // A sending hospital with a health worker, a receiving hospital with both an
  // administrator and its own doctor (never hardcoded ids).
  const sending = hospitals.find(h => !!staffAt(s(h.id) ?? '', 'health_worker'));
  const receiving = hospitals.find(h => s(h.id) !== s(sending?.id) && !!staffAt(s(h.id) ?? '', 'hospital_admin') && !!staffAt(s(h.id) ?? '', 'doctor'));
  if (!sending || !receiving) {
    console.error('FAIL: two hospitals with the required staff accounts were not found');
    process.exit(1);
  }
  const sendingId = s(sending.id)!;
  const receivingId = s(receiving.id)!;
  const hwAccount = staffAt(sendingId, 'health_worker')!;
  const adminAccount = staffAt(receivingId, 'hospital_admin')!;
  const doctorAccount = staffAt(receivingId, 'doctor')!;

  const hw = await staffClient(s(hwAccount.username)!, s(hwAccount.password)!);
  const admin = await staffClient(s(adminAccount.username)!, s(adminAccount.password)!);
  const doctor = await staffClient(s(doctorAccount.username)!, s(doctorAccount.password)!);
  check('health worker session binds', !!hw, hwAccount.username);
  check('receiving hospital admin session binds', !!admin, adminAccount.username);
  check('receiving hospital doctor session binds', !!doctor, doctorAccount.username);
  if (!hw || !admin || !doctor) process.exit(1);

  check('health worker is bound to the SENDING hospital', s(hw.user.facilityId) === sendingId, hw.user.facilityId);
  check('hospital admin is bound to the RECEIVING hospital', s(admin.user.facilityId) === receivingId, admin.user.facilityId);
  check('doctor is bound to the RECEIVING hospital', s(doctor.user.facilityId) === receivingId, doctor.user.facilityId);

  // ── 1) Create the referral (collection path, offline-capable) ────
  // A patient with a registered email so the patient-view checks can run too.
  const patientEmailOf = (p: Row) => s(p.registeredByEmail) ?? s(p.email);
  const selectedPatient =
    patients.find(p => patientEmailOf(p) && s(p.healthCardId) && s(p.name)) ??
    patients.find(p => s(p.healthCardId) && s(p.name)) ??
    patients[0];
  const patientId = s(selectedPatient?.id);
  const patientName = s(selectedPatient?.name) ?? 'Demo Patient';
  if (!patientId) {
    console.error('FAIL: no patient record available to refer');
    process.exit(1);
  }

  const hwView = await read(hw.client);
  const referralId = `r-refengine-${Date.now()}`;
  const referralCode = `REF-ENGINE-${String(Date.now()).slice(-4)}`;
  const nowIso = new Date().toISOString();
  const draft: Row = {
    id: referralId,
    referralId: referralCode,
    patientId,
    patientName,
    healthCardId: s(selectedPatient?.healthCardId),
    sourceFacilityId: sendingId,
    sourceFacilityName: s(sending.name),
    destinationFacilityId: receivingId,
    destinationFacilityName: s(receiving.name),
    department: 'General Medicine',
    priority: 'urgent',
    reason: 'Referral Closure Engine end-to-end verification',
    // The backend must force CREATED and the real actor regardless of this.
    status: 'closed',
    createdByUserId: 'FORGED-ACTOR',
    createdByName: 'Forged Actor',
    createdByRole: 'overall_admin',
    createdAt: nowIso,
    updatedAt: nowIso,
    isOverdue: false,
  };
  // A new referral is stored with its CREATED audit event, exactly as the app's
  // health-worker screen pushes it.
  const createdEvent: Row = {
    id: `re-${referralId}-created`,
    referralId,
    status: 'created',
    eventType: 'created',
    canonicalStatus: 'CREATED',
    newStatus: 'created',
    previousStatus: undefined,
    description: 'Referral created from the health worker app.',
    performedBy: 'FORGED ACTOR',
    timestamp: nowIso,
  };
  await hw.client.mutation(api.appData.saveCollection as AnyApi, {
    key: 'referrals',
    data: payloadOf([...(hwView.referrals ?? []), draft]),
  });
  await hw.client.mutation(api.appData.saveCollection as AnyApi, {
    key: 'referralEvents',
    data: payloadOf([...(hwView.referralEvents ?? []), createdEvent]),
  });

  let ref = await stored(observer, referralId);
  check('referral is stored', !!ref, ref);
  check('a new referral always starts at CREATED (a client cannot insert a closed one)', s(ref?.status) === 'created', ref?.status);
  check('the creator is the AUTHENTICATED health worker, not the client-supplied actor', s(ref?.createdByName) === s(hw.user.name), { stored: ref?.createdByName, actor: hw.user.name });
  if (!ref) process.exit(1);

  const hwSees = (await read(hw.client)).referrals ?? [];
  check('the referring health worker sees the referral', hwSees.some(r => s(r.id) === referralId));
  check(
    'the referral is stored exactly once (no duplicate records)',
    hwSees.filter(r => s(r.id) === referralId).length === 1,
    hwSees.filter(r => s(r.id) === referralId).length,
  );

  // ── 1b) The collection path cannot skip the workflow ───────────
  // A client that writes the whole referrals payload with a jumped status must
  // not be able to move a CREATED referral straight to CLOSED.
  const adminEarlyView = await read(admin.client);
  await admin.client.mutation(api.appData.saveCollection as AnyApi, {
    key: 'referrals',
    data: payloadOf((adminEarlyView.referrals ?? []).map(r =>
      s(r.id) === referralId ? { ...r, status: 'closed' } : r)),
  });
  check(
    'a CREATED referral cannot be jumped to CLOSED through the collection path',
    s((await stored(observer, referralId))?.status) === 'created',
    (await stored(observer, referralId))?.status,
  );
  check(
    'the payload cannot duplicate a referral record',
    ((await read(hw.client)).referrals ?? []).filter(r => s(r.id) === referralId).length === 1,
    ((await read(hw.client)).referrals ?? []).filter(r => s(r.id) === referralId).length,
  );

  // ── 2) Only the RECEIVING hospital may accept ───────────────────
  const wrongAccept = await trans(hw.client, { referralId, action: 'accept' });
  check('the SENDING hospital cannot accept its own referral', wrongAccept.ok === false, wrongAccept.message);
  check('sending hospital keeps the referral at CREATED', s((await stored(observer, referralId))?.status) === 'created');

  const accept = await trans(admin.client, { referralId, action: 'accept' });
  check('the receiving hospital accepts the referral', accept.ok === true, accept.message);
  ref = await stored(observer, referralId);
  check('stored status is ACCEPTED', s(ref?.status) === 'accepted', ref?.status);
  check('acceptance is attributed to the stored admin identity', s(ref?.acceptedByName) === s(admin.user.name), { stored: ref?.acceptedByName, actor: admin.user.name });

  const repeatAccept = await trans(admin.client, { referralId, action: 'accept' });
  check('accepting twice is idempotent (no duplicate event)', repeatAccept.ok === true && repeatAccept.duplicate === true, repeatAccept.message);
  const eventsAfterAccept = await storedEvents(observer, referralId);
  check('exactly one acceptance event was recorded', eventsAfterAccept.filter(e => s(e.newStatus) === 'accepted').length === 1, eventsAfterAccept.map(e => e.newStatus));

  // ── 3) Doctor assignment: receiving hospital's own doctors only ──
  const foreignDoctor = doctors.find(d => s(d.facilityId) === sendingId);
  if (foreignDoctor) {
    const badAssign = await trans(admin.client, { referralId, action: 'assign_doctor', doctorId: s(foreignDoctor.id) });
    check('a doctor from another hospital cannot be assigned', badAssign.ok === false, badAssign.message);
  }
  const ownDoctor = doctors.find(d => s(d.facilityId) === receivingId);
  if (!ownDoctor) {
    console.error('FAIL: no doctor record for the receiving hospital');
    process.exit(1);
  }
  const assign = await trans(admin.client, { referralId, action: 'assign_doctor', doctorId: s(ownDoctor.id), department: 'General Medicine' });
  check('the receiving hospital assigns one of its own doctors', assign.ok === true, assign.message);
  ref = await stored(observer, referralId);
  check('stored status is DOCTOR_ASSIGNED', s(ref?.status) === 'doctor_assigned', ref?.status);
  check('the assigned doctor is stored on the referral', s(ref?.doctorName) === s(ownDoctor.name), { stored: ref?.doctorName });

  // ── 4) Scheduling ───────────────────────────────────────────────
  const earlyArrival = await trans(admin.client, { referralId, action: 'verify_arrival' });
  check('arrival cannot be verified before scheduling', earlyArrival.ok === false, earlyArrival.message);

  const schedule = await trans(admin.client, { referralId, action: 'schedule', date: '2026-10-05', time: '10:30' });
  check('the receiving hospital schedules the appointment', schedule.ok === true, schedule.message);
  ref = await stored(observer, referralId);
  check('stored status is SCHEDULED', s(ref?.status) === 'scheduled', ref?.status);
  check('the appointment is stored', s(ref?.appointmentDate) === '2026-10-05' && s(ref?.appointmentTime) === '10:30', { date: ref?.appointmentDate, time: ref?.appointmentTime });

  // ── 5) QR arrival verification ──────────────────────────────────
  const badQr = (await admin.client.mutation(api.appReferral.verifyArrival as AnyApi, { scanned: 'NOT-A-REFERRAL' })) as Row;
  check('an unknown QR code is refused', badQr.ok === false, badQr.message);

  const foreignQr = (await hw.client.mutation(api.appReferral.verifyArrival as AnyApi, { scanned: referralCode })) as Row;
  check("another hospital's QR code is refused", foreignQr.ok === false && s(foreignQr.reason) === 'wrong_hospital', foreignQr.message);

  const qr = (await admin.client.mutation(api.appReferral.verifyArrival as AnyApi, { scanned: referralCode })) as Row;
  check('the receiving hospital verifies arrival from the QR code', qr.ok === true, qr.message);
  ref = await stored(observer, referralId);
  check('stored status is ARRIVAL_VERIFIED', s(ref?.status) === 'patient_arrived', ref?.status);

  const qrAgain = (await admin.client.mutation(api.appReferral.verifyArrival as AnyApi, { scanned: referralCode })) as Row;
  check('reusing the QR code is refused', qrAgain.ok === false && s(qrAgain.reason) === 'already_verified', qrAgain.message);

  // ── 6) Consultation → treatment (assigned doctor only) ──────────
  const adminConsult = await trans(admin.client, { referralId, action: 'start_consultation' });
  check('the hospital administrator cannot run the consultation (assigned doctor only)', adminConsult.ok === false, adminConsult.message);

  const startConsult = await trans(doctor.client, { referralId, action: 'start_consultation' });
  check('the assigned doctor starts the consultation', startConsult.ok === true, startConsult.message);
  check('stored status is CONSULTATION_COMPLETED', s((await stored(observer, referralId))?.status) === 'consultation');

  const complete = await trans(doctor.client, {
    referralId,
    action: 'complete_consultation',
    notes: 'Patient assessed; treatment started.',
    diagnosis: 'Uncontrolled hypertension',
    prescription: ['Amlodipine 5mg'],
  });
  check('the doctor completes the consultation and starts treatment', complete.ok === true, complete.message);
  ref = await stored(observer, referralId);
  check('stored status is TREATMENT_STARTED', s(ref?.status) === 'treatment', ref?.status);

  // A backward transition through the collection path is dropped as well.
  const backwards = await read(admin.client);
  await admin.client.mutation(api.appData.saveCollection as AnyApi, {
    key: 'referrals',
    data: payloadOf((backwards.referrals ?? []).map(r =>
      s(r.id) === referralId ? { ...r, status: 'accepted' } : r)),
  });
  check(
    'a backwards transition through the collection path is refused',
    s((await stored(observer, referralId))?.status) === 'treatment',
    (await stored(observer, referralId))?.status,
  );

  // ── 8) Follow-up then final closure ─────────────────────────────
  const followup = await trans(doctor.client, {
    referralId,
    action: 'schedule_followup',
    followUpDate: '2026-10-19',
    followUpType: '10:00',
    instructions: 'Review blood pressure and medication adherence.',
  });
  check('the doctor schedules a follow-up', followup.ok === true, followup.message);
  ref = await stored(observer, referralId);
  check('stored status is FOLLOW_UP', s(ref?.status) === 'followup', ref?.status);
  check('the follow-up date is stored', s(ref?.followUpDate) === '2026-10-19', ref?.followUpDate);

  const close = await trans(doctor.client, { referralId, action: 'close', notes: 'Care completed; follow-up done.' });
  check('the doctor closes the referral', close.ok === true, close.message);
  ref = await stored(observer, referralId);
  check('stored status is CLOSED', s(ref?.status) === 'closed', ref?.status);
  check('closure is attributed to the stored doctor identity', s(ref?.closedByName) === s(doctor.user.name), { stored: ref?.closedByName, actor: doctor.user.name });
  check('closure is timestamped', !!s(ref?.closedAt), ref?.closedAt);

  const afterClose = await trans(doctor.client, { referralId, action: 'record_treatment', notes: 'late note' });
  check('a closed referral cannot be moved again', afterClose.ok === false, afterClose.message);

  // ── 9) The audit trail is complete ──────────────────────────────
  const events = await storedEvents(observer, referralId);
  const sequence = events
    .slice()
    .sort((a, b) => new Date(String(a.timestamp)).getTime() - new Date(String(b.timestamp)).getTime())
    .map(e => s(e.newStatus));
  const required = ['created', 'accepted', 'doctor_assigned', 'scheduled', 'patient_arrived', 'consultation', 'treatment', 'followup', 'closed'];
  const missing = required.filter(status => !sequence.includes(status));
  check('every workflow stage has a stored audit event', missing.length === 0, { sequence, missing });
  check(
    'events are all attributed to a real actor (never "System")',
    events.length > 0 && events.every(e => !!s(e.actorName) && s(e.actorName) !== 'System' && !!s(e.actorRole)),
    events.map(e => `${e.newStatus}:${e.actorName}:${e.actorRole}`),
  );
  const transitionEvents = events.filter(e => s(e.newStatus) !== 'created');
  check(
    'each transition event records the status it moved FROM',
    transitionEvents.length >= required.length - 1 && transitionEvents.every(e => s(e.previousStatus) !== undefined),
    events.map(e => `${e.previousStatus}->${e.newStatus}`),
  );

  // ── 10) Patient sees their own referral and nothing else ────────
  const patientEmail = selectedPatient ? patientEmailOf(selectedPatient) : undefined;
  if (patientEmail) {
    const patientClient = await device();
    const bindPatient = (await patientClient.mutation(api.appSession.loginPatientSession as AnyApi, {
      email: patientEmail,
    })) as { ok?: boolean; user?: Row };
    check('the patient binds with their registered email', bindPatient?.ok === true, bindPatient);
    const patientView = await read(patientClient);
    const mine = patientView.referrals ?? [];
    check('the patient sees the referral created for them', mine.some(r => s(r.id) === referralId), mine.map(r => r.id));
    check(
      'the patient sees ONLY their own referrals',
      mine.every(r => s(r.patientId) === s(bindPatient.user?.patientId)),
      mine.map(r => r.patientId),
    );
    check(
      'the patient receives no staff roster or credentials',
      !patientView.staffUsers && !patientView.healthWorkers,
      Object.keys(patientView),
    );
    check(
      'the patient receives no other patient record',
      (patientView.patients ?? []).every(p => s(p.id) === s(bindPatient.user?.patientId)),
      (patientView.patients ?? []).map(p => p.id),
    );
    const patientEvents = patientView.referralEvents ?? [];
    check(
      'the patient can follow their own timeline',
      patientEvents.filter(e => s(e.referralId) === referralId).length >= required.length,
      patientEvents.length,
    );
  } else {
    check('the selected patient has a registered email for the login test', false);
  }

  // ── 11) The receiving hospital and the source hospital agree ────
  const adminView = (await read(admin.client)).referrals ?? [];
  const hwFinal = (await read(hw.client)).referrals ?? [];
  check('the receiving hospital sees the closed referral', adminView.some(r => s(r.id) === referralId && s(r.status) === 'closed'));
  check('the referring health worker sees the closed referral', hwFinal.some(r => s(r.id) === referralId && s(r.status) === 'closed'));
  check(
    'exactly one referral record exists for the workflow (no per-role copies)',
    hwFinal.filter(r => s(r.id) === referralId).length === 1 && adminView.filter(r => s(r.id) === referralId).length === 1,
  );

  console.log(`\nDemo referral left in place: ${referralCode} (${referralId}) — full closure recorded.`);
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`\n${failures} check(s) FAILED`);
      process.exit(1);
    }
    console.log('\nAll Referral Closure Engine checks passed.');
  })
  .catch(err => {
    console.error('FAIL: unexpected error', err);
    process.exit(1);
  });
