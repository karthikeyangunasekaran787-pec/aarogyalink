/**
 * Live end-to-end test of the medical-report and Health Card workflows against
 * the deployed Convex backend. Run with:
 *
 *     bun scripts/tests/convex-care-e2e.ts
 *
 * It exercises the two data flows the product depends on, through the same
 * functions the app calls:
 *
 *   UPLOAD → STORE → AUTHORIZE → VIEW → DOWNLOAD
 *     a health worker uploads a real file to Convex storage, the backend writes
 *     the metadata row, the patient reads and downloads it, and an unrelated
 *     hospital is refused;
 *
 *   QR → VERIFY → AUTHORIZE → PATIENT → CONSULTATION
 *     a doctor at another hospital scans the Health Card, the backend authorizes
 *     it (recording a walk-in grant), the reports uploaded elsewhere come with
 *     the record, and a WALK_IN consultation is stored WITHOUT an appointment or
 *     a referral being invented.
 *
 * It creates its own test patient (removed again at the end), so it does not
 * depend on demo data being attributed to any particular hospital. The
 * care-access grant left behind by the scan is intentional: that row IS the
 * authorization a real scan records.
 */
import { AnyApi, ConvexHttpClient } from 'convex/browser';
import { api } from '../../src/convex/_generated/api';
import { DATA_VERSION } from '../../src/contexts/cloudData';
import { seedStaffUsers } from '../../src/lib/seed-multidistrict';

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

const s = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
type Items = Record<string, unknown>[];

async function device(): Promise<ConvexHttpClient> {
  const client = new ConvexHttpClient(url!);
  const result = (await client.action(api.auth.signIn as AnyApi, { provider: 'anonymous' })) as {
    tokens?: { token: string };
  };
  if (!result?.tokens?.token) throw new Error('anonymous sign-in returned no token');
  client.setAuth(result.tokens.token);
  return client;
}

/** Scoped collection payloads plus their dataset version, as the app reads them. */
async function read(client: ConvexHttpClient) {
  const all = (await client.query(api.appData.getAll as AnyApi, {})) as Record<string, unknown>;
  const items: Record<string, Items> = {};
  const version: Record<string, string> = {};
  for (const [key, raw] of Object.entries(all)) {
    if (typeof raw !== 'string') continue;
    const parsed = JSON.parse(raw) as { v?: string; items?: unknown[] };
    if (Array.isArray(parsed.items)) items[key] = parsed.items as Items;
    if (typeof parsed.v === 'string') version[key] = parsed.v;
  }
  return { items, version };
}

const payloadOf = (items: unknown[]) => JSON.stringify({ v: DATA_VERSION, items });

/** Sign in a demo staff account and return the bound client + its hospital. */
async function bindStaff(predicate: (user: (typeof seedStaffUsers)[number]) => boolean) {
  const account = seedStaffUsers.find(predicate);
  if (!account?.username || !account.password || !account.facilityId) return null;
  const client = await device();
  const bound = (await client.mutation(api.appSession.loginStaffSession as AnyApi, {
    username: account.username,
    password: account.password,
  })) as { ok?: boolean; user?: { facilityId?: string; role?: string } };
  if (!bound?.ok) return null;
  return { client, hospitalId: bound.user?.facilityId ?? account.facilityId, account };
}

const PAYLOAD = 'AarogyaLink end-to-end report payload\nline two\n';
const stamp = Date.now();
const testPatientId = `p-e2e-${stamp}`;
const testEmail = `e2e-${stamp}@example.com`;
const healthCardId = `AL-E2E-${String(stamp).slice(-6)}`;

const healthWorker = await bindStaff(u => u.role === 'health_worker' && !!u.facilityId && !!u.username && !!u.password);
const doctorElsewhere = await bindStaff(
  u => u.role === 'doctor' && !!u.facilityId && !!u.username && !!u.password && u.facilityId !== healthWorker?.hospitalId,
);
const otherHospital = await bindStaff(
  u =>
    ['doctor', 'hospital_admin'].includes(String(u.role)) &&
    !!u.facilityId &&
    !!u.username &&
    !!u.password &&
    u.facilityId !== healthWorker?.hospitalId,
);

check('a health worker demo account binds', !!healthWorker);
check('a doctor at another hospital binds', !!doctorElsewhere);
check('a second hospital account binds (denial test)', !!otherHospital);

let createdReportId: string | undefined;
let createdConsultationId: string | undefined;

try {
  if (!healthWorker) throw new Error('cannot continue without a health worker session');
  const hw = healthWorker.client;
  const before = await read(hw);

  // Writes are only safe when the deployment carries the same dataset version
  // the app uses: a different version is treated as "first write of a new
  // dataset" and accepted unscoped. Verify before touching anything.
  check(
    'the deployment carries the app data version (writes stay scoped)',
    before.version.patients === DATA_VERSION,
    before.version.patients,
  );
  if (before.version.patients !== DATA_VERSION) throw new Error('data version mismatch — refusing to write');

  // ── A patient registered at the health worker's hospital ──────
  const testPatient = {
    id: testPatientId,
    userId: `u-${testPatientId}`,
    healthCardId,
    registeredByEmail: testEmail,
    registeredAt: new Date().toISOString().slice(0, 10),
    name: 'E2E Care Workflow Patient',
    age: 34,
    gender: 'female',
    phone: '9000000000',
    address: 'E2E address',
    village: 'E2E village',
    district: 'Pudukkottai',
    state: 'Tamil Nadu',
    bloodGroup: 'O+',
    registeredByFacilityId: healthWorker.hospitalId,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  await hw.mutation(api.appData.saveCollection as AnyApi, {
    key: 'patients',
    data: payloadOf([...(before.items.patients ?? []), testPatient]),
  });
  const withPatient = await read(hw);
  check('the hospital registers its own test patient', (withPatient.items.patients ?? []).some(p => s(p.id) === testPatientId));

  // ── UPLOAD → STORE ────────────────────────────────────────────
  const uploadUrl = (await hw.mutation(api.appReports.generateReportUploadUrl as AnyApi, {})) as string;
  check('the backend issues an upload ticket to authorized staff', typeof uploadUrl === 'string' && uploadUrl.startsWith('http'));

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: PAYLOAD,
  });
  const uploaded = (await uploadResponse.json()) as { storageId?: string };
  check('the report file reaches Convex file storage', uploadResponse.ok && !!uploaded.storageId);

  const saved = (await hw.mutation(api.appReports.saveMedicalReport as AnyApi, {
    patientId: testPatientId,
    title: 'Authorisation Test Blood Panel',
    type: 'lab_report',
    reportDate: new Date().toISOString().slice(0, 10),
    storageId: uploaded.storageId!,
    fileName: 'authorisation-test.txt',
    mimeType: 'text/plain',
    fileSize: PAYLOAD.length,
    notes: 'e2e',
  })) as {
    ok?: boolean;
    message?: string;
    report?: { id?: string; uploadedByRole?: string; hospitalId?: string };
  };
  check('the report is stored against the patient', saved?.ok === true, saved?.message);
  createdReportId = s(saved?.report?.id);
  check(
    'the stored report is attributed to the server-side actor',
    saved?.report?.uploadedByRole === healthWorker.account.role && saved?.report?.hospitalId === healthWorker.hospitalId,
    saved?.report,
  );

  const afterSave = await read(hw);
  check(
    'the report metadata syncs into the shared collection',
    (afterSave.items.medicalReports ?? []).some(r => s(r.id) === createdReportId),
  );

  // ── AUTHORIZE → VIEW → DOWNLOAD (uploading hospital) ──────────
  const fileUrl = (await hw.mutation(api.appReports.requestReportFileUrl as AnyApi, {
    reportId: createdReportId,
  })) as { ok?: boolean; url?: string; message?: string };
  check('the uploading hospital can resolve the report file', fileUrl?.ok === true && !!fileUrl.url, fileUrl?.message);
  if (fileUrl?.url) {
    const downloaded = await fetch(fileUrl.url);
    const body = await downloaded.text();
    check('the downloaded file is the report that was uploaded', downloaded.ok && body === PAYLOAD);
  }

  // ── AUTHORIZE (as the patient) ────────────────────────────────
  const patientClient = await device();
  const patientLogin = (await patientClient.mutation(api.appSession.loginPatientSession as AnyApi, {
    email: testEmail,
    healthCardId,
  })) as { ok?: boolean };
  check('the patient session binds from the stored record', patientLogin?.ok === true);
  const pData = await read(patientClient);
  check('the patient receives their own report', (pData.items.medicalReports ?? []).some(r => s(r.id) === createdReportId));
  const patientFile = (await patientClient.mutation(api.appReports.requestReportFileUrl as AnyApi, {
    reportId: createdReportId,
  })) as { ok?: boolean };
  check('the patient can download their own report', patientFile?.ok === true);

  // ── DENIAL: another hospital, and the patient as an uploader ──
  if (otherHospital) {
    const denied = (await otherHospital.client.mutation(api.appReports.requestReportFileUrl as AnyApi, {
      reportId: createdReportId,
    })) as { ok?: boolean; reason?: string; message?: string };
    check('an unrelated hospital cannot open the report file', denied?.ok === false, denied?.message ?? denied?.reason);
    // A patient may walk into ANY hospital with their card: the access is then
    // authorized as a walk-in for that hospital only, and the answer is scoped
    // to this one patient (never another hospital's records).
    const foreignScan = (await otherHospital.client.mutation(api.appCare.authorizeHealthCardScan as AnyApi, {
      scanned: healthCardId,
    })) as { ok?: boolean; authorization?: { walkIn?: boolean }; patient?: { id?: string }; reports?: { id?: string }[] };
    check(
      'a walk-in at the other hospital is authorized as a walk-in for that hospital',
      foreignScan?.ok === true && foreignScan?.authorization?.walkIn === true,
      foreignScan?.authorization,
    );
    check(
      'the other hospital receives only that patient\'s record',
      foreignScan?.patient?.id === testPatientId && (foreignScan?.reports ?? []).every(r => s(r.id) === createdReportId),
      foreignScan?.patient,
    );
  }
  const patientUpload = (await patientClient.mutation(api.appReports.saveMedicalReport as AnyApi, {
    patientId: testPatientId,
    title: 'Uploaded by the patient',
    type: 'other',
    reportDate: new Date().toISOString().slice(0, 10),
    storageId: 'not-a-real-storage-id',
    fileName: 'x.txt',
    mimeType: 'text/plain',
  })) as { ok?: boolean };
  check('a patient cannot upload a report', patientUpload?.ok === false, patientUpload);

  // ── QR → VERIFY → AUTHORIZE → PATIENT → CONSULTATION ──────────
  const appointmentsBefore = ((await read(patientClient)).items.appointments ?? []).length;
  const referralsBefore = ((await read(patientClient)).items.referrals ?? []).length;

  if (doctorElsewhere) {
    const nonStaffScan = (await patientClient.mutation(api.appCare.authorizeHealthCardScan as AnyApi, {
      scanned: `AAROGYALINK:HC:${healthCardId}`,
    })) as { ok?: boolean; reason?: string };
    check('a patient cannot use the Health Card scanner', nonStaffScan?.ok === false, nonStaffScan?.reason);

    const scan = (await doctorElsewhere.client.mutation(api.appCare.authorizeHealthCardScan as AnyApi, {
      scanned: `AAROGYALINK:HC:${healthCardId}`,
    })) as {
      ok?: boolean;
      reason?: string;
      message?: string;
      authorization?: { walkIn?: boolean; source?: string };
      reports?: { id?: string }[];
      patient?: { healthCardId?: string };
    };
    check("the doctor's Health Card scan is authorized", scan?.ok === true, scan?.message ?? scan?.reason);
    check('the decoded card is the scanned card', scan?.patient?.healthCardId === healthCardId);
    check(
      'the record carries the report uploaded at the other hospital',
      (scan?.reports ?? []).some(r => s(r.id) === createdReportId),
      scan?.reports,
    );
    check('a patient with no prior link is flagged as a walk-in', scan?.authorization?.walkIn === true, scan?.authorization);

    const consultation = (await doctorElsewhere.client.mutation(api.appCare.startWalkInConsultation as AnyApi, {
      patientId: testPatientId,
      diagnosis: 'E2E walk-in consultation',
      symptoms: ['fever'],
      prescription: ['Paracetamol'],
      notes: 'e2e',
    })) as {
      ok?: boolean;
      message?: string;
      consultation?: { id?: string; consultationType?: string; appointmentId?: string };
    };
    check('the doctor can record a walk-in consultation', consultation?.ok === true, consultation?.message);
    createdConsultationId = s(consultation?.consultation?.id);
    check(
      'the consultation is stored as WALK_IN with no appointment',
      consultation?.consultation?.consultationType === 'WALK_IN' && consultation?.consultation?.appointmentId === '',
      consultation?.consultation,
    );

    const reread = (await doctorElsewhere.client.query(api.appCare.getCarePatientRecord as AnyApi, {
      patientId: testPatientId,
    })) as { ok?: boolean; consultations?: { id?: string }[] };
    check(
      're-opening the authorized record shows the consultation',
      reread?.ok === true && (reread.consultations ?? []).some(c => s(c.id) === createdConsultationId),
    );

    const pAfter = await read(patientClient);
    check(
      'the patient sees the walk-in visit in their own history',
      (pAfter.items.consultations ?? []).some(c => s(c.id) === createdConsultationId && c.consultationType === 'WALK_IN'),
    );
    check(
      'no appointment was invented for the walk-in',
      (pAfter.items.appointments ?? []).length === appointmentsBefore,
      { before: appointmentsBefore, after: (pAfter.items.appointments ?? []).length },
    );
    check(
      'no referral was invented for the walk-in',
      (pAfter.items.referrals ?? []).length === referralsBefore,
      { before: referralsBefore, after: (pAfter.items.referrals ?? []).length },
    );
  }

  // ── CLEANUP (test data only) ──────────────────────────────────
  const current = await read(hw);
  await hw.mutation(api.appData.saveCollection as AnyApi, {
    key: 'medicalReports',
    data: payloadOf((current.items.medicalReports ?? []).filter(r => s(r.id) !== createdReportId)),
  });
  if (doctorElsewhere && createdConsultationId) {
    const doctorView = await read(doctorElsewhere.client);
    await doctorElsewhere.client.mutation(api.appData.saveCollection as AnyApi, {
      key: 'consultations',
      data: payloadOf((doctorView.items.consultations ?? []).filter(c => s(c.id) !== createdConsultationId)),
    });
  }
  const finalHw = await read(hw);
  await hw.mutation(api.appData.saveCollection as AnyApi, {
    key: 'patients',
    data: payloadOf((finalHw.items.patients ?? []).filter(p => s(p.id) !== testPatientId)),
  });
  const patientAfter = await read(patientClient);
  check(
    'the test data was cleaned up again',
    !(patientAfter.items.medicalReports ?? []).some(r => s(r.id) === createdReportId) &&
      !(patientAfter.items.consultations ?? []).some(c => s(c.id) === createdConsultationId),
  );
} catch (err) {
  failures++;
  console.error('(FAIL) unexpected error:', err);
}

console.log(failures === 0 ? '\nAll live care-workflow tests passed.' : `\n${failures} live care-workflow test(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
