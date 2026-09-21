// ============================================================================
// AarogyaLink — multi-district seed data
// ----------------------------------------------------------------------------
// The base demo fixtures live in mock-data.ts (Pudukkottai). This module adds
// the second district (Tiruchirappalli) and exposes COMPOSED seed arrays so the
// data layer has a single import for "everything the prototype ships with".
//
// District attribution
//   - hospitals carry `districtId` / `districtName`
//   - patients carry `registeredByFacilityId` (set by the registering hospital)
//   - staff carry `districtId` / `districtName`
// The backend scopes every read/write with those fields (see convex/authz.ts),
// so a District Administrator can only ever see and modify their own district.
// ============================================================================

import * as base from '@/lib/mock-data';
import type {
  Diagnostic,
  District,
  Doctor,
  HealthWorker,
  Hospital,
  MedicineStock,
  Patient,
  Referral,
  VillageAccessScore,
} from '@/types';

/** Pudukkottai hospitals were seeded without a district id — fill it in. */
export function normalizeHospitals(hospitals: Hospital[], districts: District[]): Hospital[] {
  return hospitals.map(h => {
    if (h.districtId) return h;
    const match = districts.find(d => d.name === h.district);
    return match ? { ...h, districtId: match.districtId, districtName: match.name } : h;
  });
}

/**
 * Village access scores are per-district public-health statistics, and the
 * backend hands a District Administrator only their OWN district's rows (see
 * `scopeDistrictRead` in convex/authz.ts). The base fixtures predate districts,
 * so every village is attributed to a real district here — otherwise a district
 * console would compute its Rural Healthcare Access Score from an empty set.
 */
const VILLAGE_DISTRICT_ASSIGNMENT: Record<
  string,
  { district: string; villageName?: string; latitude: number; longitude: number }
> = {
  // Pudukkottai
  v1: { district: 'Pudukkottai', latitude: 10.42, longitude: 78.75 },
  v2: { district: 'Pudukkottai', latitude: 10.38, longitude: 78.82 },
  v3: { district: 'Pudukkottai', latitude: 10.31, longitude: 78.69 },
  v6: { district: 'Pudukkottai', latitude: 10.44, longitude: 78.61 },
  v8: { district: 'Pudukkottai', latitude: 10.36, longitude: 78.98 },
  // Tiruchirappalli
  v4: { district: 'Tiruchirappalli', villageName: 'Manapparai', latitude: 10.61, longitude: 78.42 },
  v5: { district: 'Tiruchirappalli', villageName: 'Musiri', latitude: 10.95, longitude: 78.44 },
  v7: { district: 'Tiruchirappalli', villageName: 'Thuraiyur', latitude: 11.14, longitude: 78.6 },
};

export function normalizeVillageScores(
  scores: VillageAccessScore[],
  districts: District[],
): VillageAccessScore[] {
  const known = new Set(districts.map(d => d.name));
  return scores.map(score => {
    const target = VILLAGE_DISTRICT_ASSIGNMENT[score.villageId];
    if (!target || !known.has(target.district)) return score;
    return {
      ...score,
      villageName: target.villageName ?? score.villageName,
      district: target.district,
      latitude: target.latitude,
      longitude: target.longitude,
    };
  });
}

// ── Tiruchirappalli District (DIST-TRY) ───────────────────────────────────

export const extraHospitals: Hospital[] = [
  {
    id: 'h6', hospitalId: 'HOS-TRY-001', name: 'Tiruchirappalli Government Hospital',
    type: 'government', address: 'Collector Office Road, Tiruchirappalli',
    district: 'Tiruchirappalli', districtId: 'DIST-TRY', districtName: 'Tiruchirappalli', state: 'Tamil Nadu',
    phone: '0431-2410001', email: 'trygh@tn.gov.in',
    departments: ['General Medicine', 'Cardiology', 'Orthopaedics', 'Paediatrics', 'Obstetrics'],
    services: ['OPD', 'IPD', 'Emergency', 'Surgery', 'ICU', 'Laboratory', 'Pharmacy'],
    totalBeds: 220, occupiedBeds: 151, status: 'active',
    adminUserId: 'ustaff-ha6', createdByUserId: 'ustaff-da2',
    adminName: 'Balamurugan S', adminUsername: 'hosadmin_try1', adminEmail: 'bala@trygh.gov.in', adminPhone: '9840100006',
    createdAt: '2026-02-10',
  },
  {
    id: 'h7', hospitalId: 'HOS-TRY-002', name: 'Manapparai Government Hospital',
    type: 'government', address: 'Trichy Road, Manapparai',
    district: 'Tiruchirappalli', districtId: 'DIST-TRY', districtName: 'Tiruchirappalli', state: 'Tamil Nadu',
    phone: '04332-262000', email: 'manapparai@tn.gov.in',
    departments: ['General Medicine', 'Maternity', 'Paediatrics'],
    services: ['OPD', 'Emergency', 'Laboratory', 'Pharmacy'],
    totalBeds: 45, occupiedBeds: 27, status: 'active',
    adminUserId: 'ustaff-ha7', createdByUserId: 'ustaff-da2',
    adminName: 'Vijayalakshmi K', adminUsername: 'hosadmin_try2', adminEmail: 'viji@manapparai.gov.in', adminPhone: '9840100007',
    createdAt: '2026-02-12',
  },
  {
    id: 'h8', hospitalId: 'HOS-TRY-003', name: 'Srirangam Government Hospital',
    type: 'government', address: 'North Uthira Street, Srirangam',
    district: 'Tiruchirappalli', districtId: 'DIST-TRY', districtName: 'Tiruchirappalli', state: 'Tamil Nadu',
    phone: '0431-2430003', email: 'srirangam@tn.gov.in',
    departments: ['General Medicine', 'ENT'],
    services: ['OPD', 'Emergency', 'Pharmacy'],
    totalBeds: 25, occupiedBeds: 12, status: 'active',
    adminUserId: 'ustaff-ha8', createdByUserId: 'ustaff-da2',
    adminName: 'Ramesh Babu', adminUsername: 'hosadmin_try3', adminEmail: 'ramesh@srirangam.gov.in', adminPhone: '9840100008',
    createdAt: '2026-02-14',
  },
];

export const extraDoctors: Doctor[] = [
  {
    id: 'd11', userId: 'ustaff-doc11', name: 'Dr. Suresh Kumar', specialization: 'General Medicine',
    facilityId: 'h6', qualification: 'MBBS, MD', experience: 12, phone: '9840100111',
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], consultationFee: 0, rating: 4.4,
  },
  {
    id: 'd12', userId: 'ustaff-doc12', name: 'Dr. Meena R', specialization: 'Cardiology',
    facilityId: 'h6', qualification: 'MBBS, DM (Cardiology)', experience: 9, phone: '9840100112',
    availableDays: ['Mon', 'Wed', 'Fri'], consultationFee: 0, rating: 4.6,
  },
  {
    id: 'd13', userId: 'ustaff-doc13', name: 'Dr. Arun Prakash', specialization: 'General Medicine',
    facilityId: 'h7', qualification: 'MBBS', experience: 6, phone: '9840100113',
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu'], consultationFee: 0, rating: 4.2,
  },
  {
    id: 'd14', userId: 'ustaff-doc14', name: 'Dr. Lakshmi Narayanan', specialization: 'General Medicine',
    facilityId: 'h8', qualification: 'MBBS, DNB', experience: 15, phone: '9840100114',
    availableDays: ['Tue', 'Thu', 'Sat'], consultationFee: 0, rating: 4.5,
  },
];

export const extraHealthWorkers: HealthWorker[] = [
  { id: 'hw6', userId: 'ustaff-hw6', name: 'Kannan M', phone: '9840100206', facilityId: 'h6', area: 'Srirangam Block', patientsAssigned: 0 },
  { id: 'hw7', userId: 'ustaff-hw7', name: 'Selvi K', phone: '9840100207', facilityId: 'h7', area: 'Manapparai Block', patientsAssigned: 0 },
  { id: 'hw8', userId: 'ustaff-hw8', name: 'Murugan R', phone: '9840100208', facilityId: 'h8', area: 'Srirangam Town', patientsAssigned: 0 },
];

export const extraPatients: Patient[] = [
  {
    id: 'p11', userId: 'u-p11', healthCardId: 'AL-PT-2026-011',
    registeredByEmail: 'murugan.s@example.com', registeredAt: '2026-02-16',
    name: 'Murugan S', age: 46, gender: 'male', phone: '9842100011',
    address: '14 Pillaiyar Koil Street, Srirangam', village: 'Srirangam',
    district: 'Tiruchirappalli', state: 'Tamil Nadu', bloodGroup: 'B+',
    emergencyContact: '9842100111', allergies: ['Penicillin'],
    chronicConditions: ['Hypertension'], registeredByFacilityId: 'h6',
    createdAt: '2026-02-16',
  },
  {
    id: 'p12', userId: 'u-p12', healthCardId: 'AL-PT-2026-012',
    registeredByEmail: 'kavitha.m@example.com', registeredAt: '2026-02-18',
    name: 'Kavitha M', age: 34, gender: 'female', phone: '9842100012',
    address: '7 Bazaar Street, Manapparai', village: 'Manapparai',
    district: 'Tiruchirappalli', state: 'Tamil Nadu', bloodGroup: 'O+',
    emergencyContact: '9842100112', allergies: [],
    chronicConditions: ['Anaemia'], registeredByFacilityId: 'h7',
    createdAt: '2026-02-18',
  },
];

export const extraReferrals: Referral[] = [
  {
    id: 'r11', referralId: 'REF-TRY-2026-001', patientId: 'p11', patientName: 'Murugan S',
    sourceFacilityId: 'h7', sourceFacilityName: 'Manapparai Government Hospital',
    destinationFacilityId: 'h6', destinationFacilityName: 'Tiruchirappalli Government Hospital',
    department: 'Cardiology', doctorId: 'd12', doctorName: 'Dr. Meena R',
    priority: 'urgent', reason: 'Uncontrolled hypertension with chest discomfort. Cardiology evaluation required.',
    status: 'accepted', currentStep: 2, totalSteps: 8,
    appointmentDate: '2026-09-24', appointmentTime: '10:30',
    createdAt: '2026-09-18T08:15:00Z', updatedAt: '2026-09-18T11:05:00Z', isOverdue: false,
    createdByUserId: 'ustaff-hw7', createdByName: 'Selvi K', createdByRole: 'health_worker',
    acceptedByUserId: 'ustaff-ha6', acceptedByName: 'Balamurugan S',
  },
  {
    id: 'r12', referralId: 'REF-TRY-2026-002', patientId: 'p12', patientName: 'Kavitha M',
    sourceFacilityId: 'h7', sourceFacilityName: 'Manapparai Government Hospital',
    destinationFacilityId: 'h8', destinationFacilityName: 'Srirangam Government Hospital',
    department: 'General Medicine', doctorId: 'd14', doctorName: 'Dr. Lakshmi Narayanan',
    priority: 'routine', reason: 'Severe anaemia — haemoglobin 7.8 g/dL. Requires further investigation.',
    status: 'closed', currentStep: 8, totalSteps: 8,
    appointmentDate: '2026-09-05', appointmentTime: '09:30',
    createdAt: '2026-09-01T09:00:00Z', updatedAt: '2026-09-08T15:20:00Z',
    closedAt: '2026-09-08T15:20:00Z', isOverdue: false,
    createdByUserId: 'ustaff-hw7', createdByName: 'Selvi K', createdByRole: 'health_worker',
    acceptedByUserId: 'ustaff-ha8', acceptedByName: 'Ramesh Babu',
    assignedDoctorId: 'ustaff-doc14', assignedDoctorName: 'Dr. Lakshmi Narayanan',
  },
];

export const extraMedicineStock: MedicineStock[] = [
  { id: 'ms-try-1', medicineId: 'm1', medicineName: 'Amlodipine 5mg', facilityId: 'h6', facilityName: 'Tiruchirappalli Government Hospital', quantity: 320, unit: 'tablets', expiryDate: '2027-06-30', status: 'in_stock' },
  { id: 'ms-try-2', medicineId: 'm2', medicineName: 'Metformin 500mg', facilityId: 'h6', facilityName: 'Tiruchirappalli Government Hospital', quantity: 40, unit: 'tablets', expiryDate: '2027-03-31', status: 'low_stock' },
  { id: 'ms-try-3', medicineId: 'm3', medicineName: 'Paracetamol 500mg', facilityId: 'h7', facilityName: 'Manapparai Government Hospital', quantity: 260, unit: 'tablets', expiryDate: '2027-09-30', status: 'in_stock' },
];

export const extraDiagnostics: Diagnostic[] = [
  { id: 'dg-try-1', name: 'ECG', category: 'Cardiology', facilityId: 'h6', facilityName: 'Tiruchirappalli Government Hospital', available: true, waitTime: 1, cost: 0 },
  { id: 'dg-try-2', name: 'Blood Test', category: 'Pathology', facilityId: 'h7', facilityName: 'Manapparai Government Hospital', available: true, waitTime: 1, cost: 0 },
  { id: 'dg-try-3', name: 'X-Ray', category: 'Radiology', facilityId: 'h6', facilityName: 'Tiruchirappalli Government Hospital', available: false, waitTime: 3, cost: 0 },
];

// ── Composed seed arrays ──────────────────────────────────────────────────

export const seedDistricts: District[] = base.districts;

export const seedHospitals: Hospital[] = normalizeHospitals(
  [...base.hospitals, ...extraHospitals],
  base.districts,
);

export const seedStaffUsers = base.staffUsers;

export const seedDoctors: Doctor[] = [...base.doctors, ...extraDoctors];

export const seedHealthWorkers: HealthWorker[] = [...base.healthWorkers, ...extraHealthWorkers];

export const seedPatients: Patient[] = [...base.patients, ...extraPatients];

export const seedReferrals: Referral[] = [...base.referrals, ...extraReferrals];

export const seedMedicineStock: MedicineStock[] = [...base.medicineStock, ...extraMedicineStock];

export const seedDiagnostics: Diagnostic[] = [...base.diagnostics, ...extraDiagnostics];

export const seedFacilities = base.facilities;
export const seedAppointments = base.appointments;
export const seedFollowups = base.followups;
export const seedVitals = base.vitals;
export const seedHealthRecords = base.healthRecords;
export const seedConsultations = base.consultations;
export const seedNotifications = base.notifications;
export const seedReferralEvents = base.referralEvents;
export const seedVillageScores = normalizeVillageScores(base.villageAccessScores, base.districts);
export const seedPredictions = base.referralPredictions;
export const seedInsights = base.aiInsights;
