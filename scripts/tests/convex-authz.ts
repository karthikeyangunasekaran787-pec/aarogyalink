/**
 * Live backend authorization test against the deployed Convex deployment.
 * Run with: bun scripts/tests/convex-authz.ts
 *
 * Verifies the enforcement the SIH demo depends on:
 *   1. unauthenticated callers are rejected
 *   2. an authenticated but UNBOUND caller receives no healthcare data
 *   3. a HOSPITAL caller only receives its own hospital's records
 *   4. a hospital caller cannot modify or delete another hospital's data
 *   5. a hospital caller cannot mint a District Administrator account
 *   6. a PATIENT caller only receives their own records
 *   7. the District Administrator still sees the whole district
 *
 * It writes no new demo data: every write attempt is either a no-op rewrite of
 * what the caller just read, or an unauthorized write that must be rejected.
 */
import { AnyApi, ConvexHttpClient } from 'convex/browser';
import { api } from '../../src/convex/_generated/api';

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

function payloadOf(items: unknown[]): string {
  return JSON.stringify({ v: 'v7-tombstones-2026-09', items });
}

const s = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

try {
  // ── 1) Unauthenticated ──────────────────────────────────────────
  const anon = new ConvexHttpClient(url);
  let anonRejected = false;
  try {
    await anon.query(api.appData.getAll as AnyApi, {});
  } catch {
    anonRejected = true;
  }
  check('unauthenticated getAll is rejected', anonRejected);

  let anonLoginRejected = false;
  try {
    await anon.mutation(api.appSession.loginPatientSession as AnyApi, { email: 'x@y.z' });
  } catch {
    anonLoginRejected = true;
  }
  check('unauthenticated login attempt is rejected', anonLoginRejected);

  // ── 2) Authenticated but unbound ────────────────────────────────
  const unbound = await device();
  const unboundData = await read(unbound);
  check('authenticated-but-unbound caller receives no collections', Object.keys(unboundData).length === 0, Object.keys(unboundData));
  const unboundWrite = (await unbound.mutation(api.appData.saveCollection as AnyApi, {
    key: 'patients',
    data: payloadOf([]),
  })) as { written?: boolean };
  check('unbound caller cannot write', unboundWrite?.written === false, unboundWrite);

  // ── 3) District Administrator ───────────────────────────────────
  const district = await device();
  let bind = (await district.mutation(api.appSession.loginDistrictSession as AnyApi, {
    username: 'collector.dist',
  })) as { ok?: boolean };
  if (!bind?.ok) {
    bind = (await district.mutation(api.appSession.loginDistrictSession as AnyApi, {
      username: 'district@demo.com',
    })) as { ok?: boolean };
  }
  check('district administrator session binds', bind?.ok === true, bind);
  if (!bind?.ok) throw new Error('cannot continue without a district binding (prototype demo account missing)');

  const districtData = await read(district);
  const staff = districtData.staffUsers ?? [];
  const patients = districtData.patients ?? [];
  const doctors = districtData.doctors ?? [];
  const hospitals = districtData.hospitals ?? [];

  const facilitiesRepresented = new Set(staff.map(u => s(u.facilityId)).filter(Boolean));
  check(
    'district view spans multiple facilities (not narrowed)',
    facilitiesRepresented.size >= 1 && doctors.length >= 1,
    { staff: staff.length, doctors: doctors.length, hospitals: hospitals.length, patients: patients.length },
  );

  // Pick two different hospitals that have usable demo staff credentials.
  const hospitalIds = [...new Set(staff.map(u => s(u.facilityId)).filter((v): v is string => !!v))];
  const staffFor = (hospitalId: string) =>
    staff.filter(
      u =>
        s(u.facilityId) === hospitalId &&
        typeof u.password === 'string' &&
        !!u.password &&
        typeof u.username === 'string' &&
        ['doctor', 'health_worker', 'hospital_admin'].includes(String(u.role)),
    );
  const usableHospitals = hospitalIds.filter(h => staffFor(h).length > 0);
  check('at least two hospitals have staff credentials for isolation testing', usableHospitals.length >= 2, usableHospitals);

  if (usableHospitals.length >= 2) {
    const [hospitalA, hospitalB] = usableHospitals;
    const hospitalAClient = await device();
    const hospitalBClient = await device();
    const accountA = staffFor(hospitalA)[0];
    const accountB = staffFor(hospitalB)[0];

    const bindA = (await hospitalAClient.mutation(api.appSession.loginStaffSession as AnyApi, {
      username: accountA.username,
      password: accountA.password,
    })) as { ok?: boolean; user?: { facilityId?: string } };
    const bindB = (await hospitalBClient.mutation(api.appSession.loginStaffSession as AnyApi, {
      username: accountB.username,
      password: accountB.password,
    })) as { ok?: boolean };
    check('hospital A staff session binds', bindA?.ok === true, bindA);
    check(
      'binding role/hospital is derived from the STORED staff record',
      bindA?.user?.facilityId === hospitalA,
      bindA?.user?.facilityId,
    );
    check('hospital B staff session binds', bindB?.ok === true, bindB);

    const badLogin = (await (await device()).mutation(api.appSession.loginStaffSession as AnyApi, {
      username: accountA.username,
      password: 'definitely-not-the-password',
    })) as { ok?: boolean; reason?: string };
    check('wrong password is rejected by the server', badLogin?.ok === false && badLogin?.reason === 'invalid', badLogin);

    // The first-run fallback (used only when a deployment stores NO staff
    // records) must be inert as soon as real records exist.
    const forged = (await (await device()).mutation(api.appSession.loginStaffSession as AnyApi, {
      username: 'attacker.made.up',
      password: 'anything',
      fallback: {
        role: 'hospital_admin',
        facilityId: hospitalB,
        staffUserId: 'ustaff-forged',
        name: 'Forged Admin',
      },
    })) as { ok?: boolean };
    check('first-run fallback does not work once staff records exist', forged?.ok === false, forged);
    const forgedPatient = (await (await device()).mutation(api.appSession.loginPatientSession as AnyApi, {
      email: 'attacker@example.com',
      fallback: { patientId: 'p1', name: 'Forged Patient' },
    })) as { ok?: boolean };
    check('first-run patient fallback does not work once patients exist', forgedPatient?.ok === false, forgedPatient);
    const forgedDistrict = (await (await device()).mutation(api.appSession.loginDistrictSession as AnyApi, {
      username: 'attacker.made.up',
    })) as { ok?: boolean };
    check('unknown district username is rejected when a gov record exists', forgedDistrict?.ok === false, forgedDistrict);

    // ── 4) Hospital-scoped reads ──────────────────────────────────
    const a = await read(hospitalAClient);
    const inHospital = (key: string, field: string) => (a[key] ?? []).every(r => s(r[field]) === hospitalA);
    check('hospital A: staffUsers scoped to own facility', inHospital('staffUsers', 'facilityId') && (a.staffUsers?.length ?? 0) > 0);
    check('hospital A: doctors scoped to own facility', inHospital('doctors', 'facilityId'));
    check('hospital A: healthWorkers scoped to own facility', inHospital('healthWorkers', 'facilityId'));
    check('hospital A: medicineStock scoped to own facility', inHospital('medicineStock', 'facilityId'));
    check('hospital A: diagnostics scoped to own facility', inHospital('diagnostics', 'facilityId'));
    check('hospital A: appointments scoped to own facility', inHospital('appointments', 'facilityId'));
    check('hospital A: hospitals list limited to own hospital', (a.hospitals ?? []).every(h => s(h.id) === hospitalA));
    check(
      'hospital A: referrals limited to source/destination hospital',
      (a.referrals ?? []).every(r => s(r.sourceFacilityId) === hospitalA || s(r.destinationFacilityId) === hospitalA),
    );
    check('hospital A: district analytics withheld', a.villageAccessScores === undefined);

    const bStaffIds = new Set(staffFor(hospitalB).map(u => s(u.id)));
    const leaked = (a.staffUsers ?? []).filter(u => bStaffIds.has(s(u.id)));
    check('hospital A cannot see hospital B staff records', leaked.length === 0, leaked.map(u => u.id));
    const bDoctorIds = new Set(doctors.filter(d => s(d.facilityId) === hospitalB).map(d => s(d.id)));
    check(
      'hospital A cannot see hospital B doctors',
      (a.doctors ?? []).filter(d => bDoctorIds.has(s(d.id))).length === 0,
    );

    // ── 5) Write protection ───────────────────────────────────────
    const bDoctor = doctors.find(d => s(d.facilityId) === hospitalB && s(d.id));
    if (bDoctor) {
      const tampered = { ...bDoctor, name: 'TAMPERED-BY-ANOTHER-HOSPITAL' };
      // Payload omits hospital B's own doctors and rewrites one of them.
      await hospitalAClient.mutation(api.appData.saveCollection as AnyApi, {
        key: 'doctors',
        data: payloadOf([...(a.doctors ?? []), tampered]),
      });
      const after = await read(district);
      const storedB = (after.doctors ?? []).find(d => s(d.id) === s(bDoctor.id));
      check(
        "hospital A cannot modify hospital B's doctor record",
        storedB !== undefined && storedB.name !== 'TAMPERED-BY-ANOTHER-HOSPITAL',
        storedB,
      );
      const storedBCount = (after.doctors ?? []).filter(d => s(d.facilityId) === hospitalB).length;
      const originalBCount = doctors.filter(d => s(d.facilityId) === hospitalB).length;
      check(
        "hospital B doctors are NOT deleted by another hospital's payload",
        storedBCount === originalBCount,
        { storedBCount, originalBCount },
      );
      const storedACount = (after.doctors ?? []).filter(d => s(d.facilityId) === hospitalA).length;
      const originalACount = doctors.filter(d => s(d.facilityId) === hospitalA).length;
      check('hospital A can still write its own doctors', storedACount === originalACount, {
        storedACount,
        originalACount,
      });
    }

    // Escalation: a hospital user must not mint a District Administrator.
    await hospitalAClient.mutation(api.appData.saveCollection as AnyApi, {
      key: 'staffUsers',
      data: payloadOf([
        ...(a.staffUsers ?? []),
        {
          id: 'ustaff-escalation-test',
          name: 'Escalation Test',
          username: 'escalation.gov',
          password: 'x',
          role: 'gov_admin',
          facilityId: hospitalA,
          status: 'active',
        },
      ]),
    });
    const afterEscalation = await read(district);
    check(
      'hospital user cannot create a gov_admin account',
      !(afterEscalation.staffUsers ?? []).some(u => u.username === 'escalation.gov'),
    );

    // Whole-collection deletion must stay district-only.
    let deletionRejected = false;
    try {
      await hospitalAClient.mutation(api.appData.deleteCollection as AnyApi, { key: 'doctors' });
    } catch {
      deletionRejected = true;
    }
    const stillThere = await read(district);
    check('hospital user cannot delete a shared collection', deletionRejected && (stillThere.doctors?.length ?? 0) > 0);

    // ── 5b) Patient attribution & cross-hospital isolation ────────
    // A hospital may only see its own registered patients (plus shared
    // unattributed demo records). We create one patient as hospital A, check
    // hospital B can neither see nor steal it, then remove it again.
    const testPatientId = 'p-authtest-isolation';
    const testPatient = {
      id: testPatientId,
      userId: 'u-authtest',
      healthCardId: 'AL-PT-2026-900',
      registeredByEmail: 'authtest@example.com',
      registeredAt: '2026-09-20',
      name: 'Authorization Test Patient',
      age: 30,
      gender: 'other',
      phone: '9000000000',
      address: 'Isolation Test Address',
      village: 'Isolation Test Village',
      district: 'Pudukkottai',
      state: 'Tamil Nadu',
      registeredByFacilityId: hospitalA,
      createdAt: '2026-09-20',
    };
    const patientsBeforeA = a.patients ?? [];
    try {
      await hospitalAClient.mutation(api.appData.saveCollection as AnyApi, {
        key: 'patients',
        data: payloadOf([...patientsBeforeA, testPatient]),
      });
      const aAfter = await read(hospitalAClient);
      check(
        'hospital A sees the patient it registered',
        (aAfter.patients ?? []).some(p => s(p.id) === testPatientId),
      );

      const bAfter = await read(hospitalBClient);
      check(
        "hospital B cannot see hospital A's registered patient",
        !(bAfter.patients ?? []).some(p => s(p.id) === testPatientId),
        (bAfter.patients ?? []).map(p => p.id),
      );

      // Hospital B must not be able to claim or overwrite it either.
      await hospitalBClient.mutation(api.appData.saveCollection as AnyApi, {
        key: 'patients',
        data: payloadOf([
          ...(bAfter.patients ?? []),
          { ...testPatient, name: 'STOLEN', registeredByFacilityId: hospitalB },
        ]),
      });
      const afterTheft = await read(district);
      const storedTest = (afterTheft.patients ?? []).find(p => s(p.id) === testPatientId);
      check(
        "hospital B cannot steal or overwrite hospital A's patient",
        storedTest !== undefined &&
          storedTest.name !== 'STOLEN' &&
          s(storedTest.registeredByFacilityId) === hospitalA,
        storedTest,
      );
    } finally {
      await hospitalAClient.mutation(api.appData.saveCollection as AnyApi, {
        key: 'patients',
        data: payloadOf(patientsBeforeA.filter(p => s(p.id) !== testPatientId)),
      });
      const cleaned = await read(district);
      check(
        'isolation test patient was cleaned up',
        !(cleaned.patients ?? []).some(p => s(p.id) === testPatientId),
      );
    }

    // Invariant: everything a hospital sees is its own or unattributed, and its
    // clinical records only ever reference patients it may see.
    check(
      'hospital A: patients are own or unattributed only',
      (a.patients ?? []).every(p => {
        const owner = s(p.registeredByFacilityId);
        return !owner || owner === hospitalA;
      }),
      (a.patients ?? []).filter(p => s(p.registeredByFacilityId) && s(p.registeredByFacilityId) !== hospitalA),
    );
    const visibleIds = new Set((a.patients ?? []).map(p => s(p.id)));
    check(
      'hospital A: clinical records reference only visible patients',
      ['vitals', 'consultations', 'followups', 'healthRecords'].every(key =>
        (a[key] ?? []).every(r => visibleIds.has(s(r.patientId))),
      ),
      ['vitals', 'consultations', 'followups', 'healthRecords'].map(key => ({
        key,
        leaked: (a[key] ?? []).filter(r => !visibleIds.has(s(r.patientId))).map(r => s(r.patientId)),
      })),
    );

    // ── 6) Patient scope ──────────────────────────────────────────
    const withEmail = patients.find(p => s(p.registeredByEmail) && s(p.id));
    if (withEmail) {
      const patientClient = await device();
      const patientId = s(withEmail.id);
      const patientLogin = (await patientClient.mutation(api.appSession.loginPatientSession as AnyApi, {
        email: withEmail.registeredByEmail,
        healthCardId: s(withEmail.healthCardId),
      })) as { ok?: boolean; user?: { patientId?: string } };
      check('patient session binds from the stored patient record', patientLogin?.ok === true, patientLogin?.reason);
      check('patient binding uses the stored patient id', patientLogin?.user?.patientId === patientId);

      const p = await read(patientClient);
      check('patient receives only their own patient record', (p.patients ?? []).length === 1 && s((p.patients ?? [])[0]?.id) === patientId, p.patients?.length);
      const own = (key: string) => (p[key] ?? []).every(r => s(r.patientId) === patientId);
      check('patient: vitals scoped to own patientId', own('vitals'));
      check('patient: health records scoped to own patientId', own('healthRecords'));
      check('patient: consultations scoped to own patientId', own('consultations'));
      check('patient: appointments scoped to own patientId', own('appointments'));
      check('patient: follow-ups scoped to own patientId', own('followups'));
      check('patient: referrals scoped to own patientId', own('referrals'));
      check('patient never receives staff credentials', p.staffUsers === undefined);
      check('patient does not receive district analytics', p.villageAccessScores === undefined);
      check('patient keeps the facility directory for booking', p.hospitals !== undefined || p.doctors !== undefined);

      // A patient must not be able to write another patient's vitals…
      const otherPatientVitals = (districtData.vitals ?? []).filter(v => s(v.patientId) !== patientId).slice(0, 1);
      await patientClient.mutation(api.appData.saveCollection as AnyApi, {
        key: 'vitals',
        data: payloadOf([
          ...(p.vitals ?? []),
          ...otherPatientVitals.map(v => ({ ...v, spO2: 1 })),
        ]),
      });
      const vitalsAfter = await read(district);
      const unchanged = otherPatientVitals.every(v => {
        const stored = (vitalsAfter.vitals ?? []).find(x => s(x.id) === s(v.id));
        return stored && stored.spO2 === v.spO2;
      });
      check("patient cannot overwrite another patient's vitals", unchanged);

      // …and no other patient's record may be edited or removed.
      const otherPatient = patients.find(x => s(x.id) !== patientId);
      if (otherPatient) {
        await patientClient.mutation(api.appData.saveCollection as AnyApi, {
          key: 'patients',
          data: payloadOf([...(p.patients ?? []), { ...otherPatient, name: 'TAMPERED-BY-PATIENT' }]),
        });
        const patientsAfter = await read(district);
        const storedOther = (patientsAfter.patients ?? []).find(x => s(x.id) === s(otherPatient.id));
        check(
          "patient cannot modify another patient's record",
          storedOther !== undefined && storedOther.name !== 'TAMPERED-BY-PATIENT',
        );
        check(
          "other patients are not deleted by a patient's payload",
          (patientsAfter.patients ?? []).length === patients.length,
          { after: patientsAfter.patients?.length, before: patients.length },
        );
      }
    } else {
      check('patient scope tested (skipped: no patient with a registered email in the cloud)', false);
    }
  }
} catch (err) {
  failures++;
  console.error('(FAIL) unexpected error:', err);
}

console.log(failures === 0 ? '\nAll live authorization tests passed.' : `\n${failures} live authorization test(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
