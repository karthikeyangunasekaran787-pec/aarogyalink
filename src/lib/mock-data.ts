// ============================================================================
// AarogyaLink - Synthetic Demo Data
// ============================================================================

import type {
  Patient, Doctor, Facility, Referral, Appointment, Followup,
  HealthWorker, Vitals, HealthRecord, MedicineStock, Diagnostic,
  VillageAccessScore, Notification, ReferralEvent, Consultation,
  ReferralPrediction, DistrictAnalytics, ReferralFunnelStage, InsightCard, Hospital
} from '@/types';

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------
export const patients: Patient[] = [
  {
    id: 'p1', userId: 'u1', healthCardId: 'AL-PT-2026-001', registeredByEmail: 'patient@demo.com',
    registeredAt: '2025-11-15', name: 'Lakshmi Devi', age: 62, gender: 'female',
    phone: '9876543210', address: '12 Amman Kovil Street', village: 'Kallikudi',
    district: 'Madurai', state: 'Tamil Nadu', bloodGroup: 'B+',
    aadhaarLast4: '4521', emergencyContact: '9876543211',
    allergies: ['Penicillin'], chronicConditions: ['Diabetes Type 2', 'Hypertension'],
    createdAt: '2025-11-15',
  },
  {
    id: 'p2', userId: 'u2', healthCardId: 'AL-PT-2026-002', registeredByEmail: 'raman@demo.com',
    registeredAt: '2025-12-01', name: 'Raman Sharma', age: 45, gender: 'male',
    phone: '9876543220', address: '45 Gandhi Road', village: 'Thoor',
    district: 'Madurai', state: 'Tamil Nadu', bloodGroup: 'O+',
    aadhaarLast4: '7832', createdAt: '2025-12-01',
  },
  {
    id: 'p3', userId: 'u3', healthCardId: 'AL-PT-2026-003', registeredByEmail: 'meena@demo.com',
    registeredAt: '2026-01-10', name: 'Meena Kumari', age: 28, gender: 'female',
    phone: '9876543230', address: '7 Temple Street', village: 'Melur',
    district: 'Madurai', state: 'Tamil Nadu', bloodGroup: 'A+',
    createdAt: '2026-01-10',
  },
  {
    id: 'p4', userId: 'u4', healthCardId: 'AL-PT-2026-004', registeredByEmail: 'murugan@demo.com',
    registeredAt: '2026-02-05', name: 'Murugan P', age: 55, gender: 'male',
    phone: '9876543240', address: '89 Main Road', village: 'Vadipatti',
    district: 'Madurai', state: 'Tamil Nadu', bloodGroup: 'AB+',
    chronicConditions: ['Asthma'], createdAt: '2026-02-05',
  },
  {
    id: 'p5', userId: 'u5', healthCardId: 'AL-PT-2026-005', registeredByEmail: 'priya@demo.com',
    registeredAt: '2026-02-20', name: 'Priya R', age: 35, gender: 'female',
    phone: '9876543250', address: '23 North Street', village: 'Usilampatti',
    district: 'Madurai', state: 'Tamil Nadu', bloodGroup: 'B-',
    createdAt: '2026-02-20',
  },
  {
    id: 'p6', userId: 'u6', healthCardId: 'AL-PT-2026-006', registeredByEmail: 'kumar@demo.com',
    registeredAt: '2026-03-01', name: 'Kumar S', age: 70, gender: 'male',
    phone: '9876543260', address: '56 South Road', village: 'Kallikudi',
    district: 'Madurai', state: 'Tamil Nadu', bloodGroup: 'O-',
    chronicConditions: ['COPD', 'Hypertension'], createdAt: '2026-03-01',
  },
  {
    id: 'p7', userId: 'u7', healthCardId: 'AL-PT-2026-007', registeredByEmail: 'anitha@demo.com',
    registeredAt: '2026-03-10', name: 'Anitha V', age: 42, gender: 'female',
    phone: '9876543270', address: '34 East Street', village: 'Thoor',
    district: 'Madurai', state: 'Tamil Nadu', createdAt: '2026-03-10',
  },
  {
    id: 'p8', userId: 'u8', healthCardId: 'AL-PT-2026-008', registeredByEmail: 'rajan@demo.com',
    registeredAt: '2026-04-01', name: 'Rajan M', age: 58, gender: 'male',
    phone: '9876543280', address: '67 West Road', village: 'Melur',
    district: 'Madurai', state: 'Tamil Nadu', bloodGroup: 'A-',
    chronicConditions: ['Diabetes Type 2'], createdAt: '2026-04-01',
  },
  {
    id: 'p9', userId: 'u9', healthCardId: 'AL-PT-2026-009', registeredByEmail: 'sangeetha@demo.com',
    registeredAt: '2026-04-15', name: 'Sangeetha K', age: 31, gender: 'female',
    phone: '9876543290', address: '11 Park Street', village: 'Vadipatti',
    district: 'Madurai', state: 'Tamil Nadu', bloodGroup: 'O+',
    createdAt: '2026-04-15',
  },
  {
    id: 'p10', userId: 'u10', healthCardId: 'AL-PT-2026-010', registeredByEmail: 'vetri@demo.com',
    registeredAt: '2026-05-01', name: 'Vetri V', age: 22, gender: 'male',
    phone: '9876543300', address: '90 Lake Road', village: 'Usilampatti',
    district: 'Madurai', state: 'Tamil Nadu', bloodGroup: 'B+',
    createdAt: '2026-05-01',
  },
];

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------
export const facilities: Facility[] = [
  {
    id: 'f1', name: 'Kallikudi Primary Health Centre', type: 'phc',
    address: 'Main Road, Kallikudi', village: 'Kallikudi', district: 'Madurai',
    state: 'Tamil Nadu', latitude: 10.05, longitude: 78.12, phone: '0452-2345001',
    emergencyAvailable: true, departments: ['General Medicine', 'Maternity'],
    totalBeds: 10, occupiedBeds: 6, specialistsAvailable: 1,
    diagnosticsAvailable: ['Blood Test', 'Urine Test', 'ECG'],
    medicinesAvailable: ['Paracetamol', 'Metformin', 'Amlodipine', 'Salbutamol'],
    averageWaitTime: 25, rating: 3.8, careMatchScore: 72,
  },
  {
    id: 'f2', name: 'Thoor Community Health Centre', type: 'chc',
    address: 'Hospital Road, Thoor', village: 'Thoor', district: 'Madurai',
    state: 'Tamil Nadu', latitude: 10.08, longitude: 78.15, phone: '0452-2345002',
    emergencyAvailable: true, departments: ['General Medicine', 'Surgery', 'Pediatrics', 'OBG'],
    totalBeds: 30, occupiedBeds: 22, specialistsAvailable: 4,
    diagnosticsAvailable: ['Blood Test', 'Urine Test', 'X-Ray', 'ECG', 'Ultrasound'],
    medicinesAvailable: ['Paracetamol', 'Amoxicillin', 'Metformin', 'Omeprazole', 'Salbutamol', 'Amlodipine'],
    averageWaitTime: 40, rating: 4.1, careMatchScore: 85,
  },
  {
    id: 'f3', name: 'Madurai District Hospital', type: 'dh',
    address: 'Hospital Road, Madurai', village: 'Madurai', district: 'Madurai',
    state: 'Tamil Nadu', latitude: 9.925, longitude: 78.119, phone: '0452-2345003',
    emergencyAvailable: true,
    departments: ['General Medicine', 'Surgery', 'Cardiology', 'Orthopedics', 'Pediatrics', 'OBG', 'ENT', 'Ophthalmology'],
    totalBeds: 150, occupiedBeds: 112, specialistsAvailable: 18,
    diagnosticsAvailable: ['Blood Test', 'Urine Test', 'X-Ray', 'CT Scan', 'MRI', 'ECG', 'Ultrasound', 'Endoscopy'],
    medicinesAvailable: ['Paracetamol', 'Amoxicillin', 'Metformin', 'Omeprazole', 'Salbutamol', 'Amlodipine', 'Atorvastatin', 'Clopidogrel'],
    averageWaitTime: 55, rating: 4.3, careMatchScore: 94,
  },
  {
    id: 'f4', name: 'Melur Government Hospital', type: 'dh',
    address: 'District Road, Melur', village: 'Melur', district: 'Madurai',
    state: 'Tamil Nadu', latitude: 9.97, longitude: 78.28, phone: '0452-2345004',
    emergencyAvailable: true,
    departments: ['General Medicine', 'Surgery', 'Pediatrics', 'OBG'],
    totalBeds: 60, occupiedBeds: 41, specialistsAvailable: 7,
    diagnosticsAvailable: ['Blood Test', 'Urine Test', 'X-Ray', 'ECG', 'Ultrasound'],
    medicinesAvailable: ['Paracetamol', 'Amoxicillin', 'Metformin', 'Omeprazole'],
    averageWaitTime: 35, rating: 4.0, careMatchScore: 78,
  },
  {
    id: 'f5', name: 'Meenakshi Medical College Hospital', type: 'medical_college',
    address: 'College Road, Madurai', village: 'Madurai', district: 'Madurai',
    state: 'Tamil Nadu', latitude: 9.93, longitude: 78.13, phone: '0452-2345005',
    emergencyAvailable: true,
    departments: ['General Medicine', 'Surgery', 'Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'OBG', 'ENT', 'Ophthalmology', 'Dermatology', 'Psychiatry'],
    totalBeds: 500, occupiedBeds: 380, specialistsAvailable: 45,
    diagnosticsAvailable: ['Blood Test', 'Urine Test', 'X-Ray', 'CT Scan', 'MRI', 'PET Scan', 'ECG', 'Ultrasound', 'Endoscopy', 'Biopsy'],
    medicinesAvailable: ['Paracetamol', 'Amoxicillin', 'Metformin', 'Omeprazole', 'Salbutamol', 'Amlodipine', 'Atorvastatin', 'Clopidogrel', 'Insulin', 'Warfarin'],
    averageWaitTime: 75, rating: 4.5, careMatchScore: 98,
  },
];

// ---------------------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------------------
export const doctors: Doctor[] = [
  // ── Hospital 1: Pudukkottai Government Hospital (h1) ────────
  { id: 'd1', userId: 'ustaff-doc1', name: 'Dr. Arun Kumar', specialization: 'Cardiology', facilityId: 'h1', qualification: 'MD Cardiology', experience: 12, phone: '9840100101', availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], consultationFee: 200, rating: 4.6 },
  { id: 'd2', userId: 'ustaff-doc2', name: 'Dr. Priya Sharma', specialization: 'General Medicine', facilityId: 'h1', qualification: 'MBBS, MD', experience: 8, phone: '9840100102', availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], consultationFee: 100, rating: 4.4 },
  // ── Hospital 2: Alangudi PHC (h2) ──────────────────────────
  { id: 'd3', userId: 'ustaff-doc3', name: 'Dr. Ravi Shankar', specialization: 'General Medicine', facilityId: 'h2', qualification: 'MBBS', experience: 5, phone: '9840100103', availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], consultationFee: 100, rating: 4.2 },
  { id: 'd4', userId: 'ustaff-doc4', name: 'Dr. Kavitha N', specialization: 'Maternity', facilityId: 'h2', qualification: 'MBBS, DGO', experience: 10, phone: '9840100104', availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], consultationFee: 150, rating: 4.5 },
  // ── Hospital 3: Aranthangi CHC (h3) ────────────────────────
  { id: 'd5', userId: 'ustaff-doc5', name: 'Dr. Mohan Prasad', specialization: 'Surgery', facilityId: 'h3', qualification: 'MS Surgery', experience: 15, phone: '9840100105', availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], consultationFee: 200, rating: 4.7 },
  { id: 'd6', userId: 'ustaff-doc6', name: 'Dr. Kamala Devi', specialization: 'Paediatrics', facilityId: 'h3', qualification: 'MBBS, MD Paediatrics', experience: 9, phone: '9840100106', availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], consultationFee: 150, rating: 4.3 },
  // ── Hospital 4: Illupur GH (h4) ────────────────────────────
  { id: 'd7', userId: 'ustaff-doc7', name: 'Dr. Rajesh Verma', specialization: 'General Medicine', facilityId: 'h4', qualification: 'MBBS, MD', experience: 7, phone: '9840100107', availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], consultationFee: 100, rating: 4.1 },
  { id: 'd8', userId: 'ustaff-doc8', name: 'Dr. Anitha R', specialization: 'Orthopaedics', facilityId: 'h4', qualification: 'MBBS, MS Ortho', experience: 11, phone: '9840100108', availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], consultationFee: 200, rating: 4.4 },
  // ── Hospital 5: Gandaravakottai PHC (h5) ────────────────────
  { id: 'd9', userId: 'ustaff-doc9', name: 'Dr. Senthil Kumar', specialization: 'General Medicine', facilityId: 'h5', qualification: 'MBBS', experience: 4, phone: '9840100109', availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], consultationFee: 100, rating: 4.0 },
  { id: 'd10', userId: 'ustaff-doc10', name: 'Dr. Lakshmi P', specialization: 'General Medicine', facilityId: 'h5', qualification: 'MBBS', experience: 3, phone: '9840100110', availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], consultationFee: 100, rating: 3.9 },
];

// ---------------------------------------------------------------------------
// Health Workers
// ---------------------------------------------------------------------------
export const healthWorkers: HealthWorker[] = [
  { id: 'hw1', userId: 'ustaff-hw1', name: 'Suganthi M', phone: '9840100201', facilityId: 'h1', area: 'Pudukkottai Town', patientsAssigned: 45 },
  { id: 'hw2', userId: 'ustaff-hw2', name: 'Rajendran K', phone: '9840100202', facilityId: 'h2', area: 'Alangudi', patientsAssigned: 32 },
  { id: 'hw3', userId: 'ustaff-hw3', name: 'Senthil Kumaran', phone: '9840100203', facilityId: 'h3', area: 'Aranthangi', patientsAssigned: 38 },
  { id: 'hw4', userId: 'ustaff-hw4', name: 'Kumar S', phone: '9840100204', facilityId: 'h4', area: 'Illupur', patientsAssigned: 28 },
  { id: 'hw5', userId: 'ustaff-hw5', name: 'Anitha V', phone: '9840100205', facilityId: 'h5', area: 'Gandaravakottai', patientsAssigned: 22 },
];

// ---------------------------------------------------------------------------
// Staff Users (created by Hospital Administrators)
// ---------------------------------------------------------------------------
import type { User } from '@/types';
export const staffUsers: User[] = [
  // ── District Administrator (auto-login, no password needed) ──────────
  { id: 'uga1', name: 'District Collector', email: 'district@demo.com', role: 'gov_admin', username: 'collector.dist', phone: '9860100001', status: 'active', createdAt: '2026-01-01', lastLogin: '2026-09-01' },

  // ── Hospital 1: Pudukkottai Government Hospital (HOS-PDK-001) ────────
  { id: 'ustaff-ha1', name: 'Rajesh Kumar', email: 'rajesh@pgsh.gov.in', role: 'hospital_admin', username: 'rajesh.pdk001', password: 'Admin@123', phone: '9840100001', facilityId: 'h1', status: 'active', createdAt: '2024-03-15', lastLogin: '2026-09-01', mustChangePassword: true },
  { id: 'ustaff-doc1', name: 'Dr. Arun Kumar', email: 'arun@pgsh.gov.in', role: 'doctor', username: 'arun.pdk001', password: 'Doctor@123', phone: '9840100101', facilityId: 'h1', departmentId: 'Cardiology', status: 'active', createdAt: '2024-04-01', mustChangePassword: true },
  { id: 'ustaff-doc2', name: 'Dr. Priya Sharma', email: 'priya@pgsh.gov.in', role: 'doctor', username: 'priya.pdk002', password: 'Doctor@123', phone: '9840100102', facilityId: 'h1', departmentId: 'General Medicine', status: 'active', createdAt: '2024-04-01', mustChangePassword: true },
  { id: 'ustaff-hw1', name: 'Suganthi M', email: 'suganthi@pgsh.gov.in', role: 'health_worker', username: 'suganthi.pdk001', password: 'HW@12345', phone: '9840100201', facilityId: 'h1', status: 'active', createdAt: '2024-05-01', mustChangePassword: true },

  // ── Hospital 2: Alangudi Primary Health Centre (HOS-PDK-002) ─────────
  { id: 'ustaff-ha2', name: 'Meena Devi', email: 'meena@aphc.gov.in', role: 'hospital_admin', username: 'meena.pdk002', password: 'Admin@123', phone: '9840100002', facilityId: 'h2', status: 'active', createdAt: '2024-06-20', lastLogin: '2026-09-01', mustChangePassword: true },
  { id: 'ustaff-doc3', name: 'Dr. Ravi Shankar', email: 'ravi@aphc.gov.in', role: 'doctor', username: 'ravi.pdk003', password: 'Doctor@123', phone: '9840100103', facilityId: 'h2', departmentId: 'General Medicine', status: 'active', createdAt: '2024-07-01', mustChangePassword: true },
  { id: 'ustaff-doc4', name: 'Dr. Kavitha N', email: 'kavitha@aphc.gov.in', role: 'doctor', username: 'kavitha.pdk004', password: 'Doctor@123', phone: '9840100104', facilityId: 'h2', departmentId: 'Maternity', status: 'active', createdAt: '2024-07-01', mustChangePassword: true },
  { id: 'ustaff-hw2', name: 'Rajendran K', email: 'rajendran@aphc.gov.in', role: 'health_worker', username: 'rajendran.pdk002', password: 'HW@12345', phone: '9840100202', facilityId: 'h2', status: 'active', createdAt: '2024-08-01', mustChangePassword: true },

  // ── Hospital 3: Aranthangi Community Health Centre (HOS-PDK-003) ──────
  { id: 'ustaff-ha3', name: 'Senthil Murugan', email: 'senthil@achc.gov.in', role: 'hospital_admin', username: 'senthil.pdk003', password: 'Admin@123', phone: '9840100003', facilityId: 'h3', status: 'active', createdAt: '2024-01-10', lastLogin: '2026-09-01', mustChangePassword: true },
  { id: 'ustaff-doc5', name: 'Dr. Mohan Prasad', email: 'mohan@achc.gov.in', role: 'doctor', username: 'mohan.pdk005', password: 'Doctor@123', phone: '9840100105', facilityId: 'h3', departmentId: 'Surgery', status: 'active', createdAt: '2024-02-01', mustChangePassword: true },
  { id: 'ustaff-doc6', name: 'Dr. Kamala Devi', email: 'kamala@achc.gov.in', role: 'doctor', username: 'kamala.pdk006', password: 'Doctor@123', phone: '9840100106', facilityId: 'h3', departmentId: 'Paediatrics', status: 'active', createdAt: '2024-02-01', mustChangePassword: true },
  { id: 'ustaff-hw3', name: 'Senthil Kumaran', email: 'senthilk@achc.gov.in', role: 'health_worker', username: 'senthilk.pdk003', password: 'HW@12345', phone: '9840100203', facilityId: 'h3', status: 'active', createdAt: '2024-03-01', mustChangePassword: true },

  // ── Hospital 4: Illupur Government Hospital (HOS-PDK-004) ────────────
  { id: 'ustaff-ha4', name: 'Kavitha R', email: 'kavitha.r@igh.gov.in', role: 'hospital_admin', username: 'kavitha.pdk004', password: 'Admin@123', phone: '9840100004', facilityId: 'h4', status: 'active', createdAt: '2024-09-01', lastLogin: '2026-09-01', mustChangePassword: true },
  { id: 'ustaff-doc7', name: 'Dr. Rajesh Verma', email: 'rajeshv@igh.gov.in', role: 'doctor', username: 'rajeshv.pdk007', password: 'Doctor@123', phone: '9840100107', facilityId: 'h4', departmentId: 'General Medicine', status: 'active', createdAt: '2024-10-01', mustChangePassword: true },
  { id: 'ustaff-doc8', name: 'Dr. Anitha R', email: 'anitha@igh.gov.in', role: 'doctor', username: 'anitha.pdk008', password: 'Doctor@123', phone: '9840100108', facilityId: 'h4', departmentId: 'Orthopaedics', status: 'active', createdAt: '2024-10-01', mustChangePassword: true },
  { id: 'ustaff-hw4', name: 'Kumar S', email: 'kumar@igh.gov.in', role: 'health_worker', username: 'kumar.pdk004', password: 'HW@12345', phone: '9840100204', facilityId: 'h4', status: 'active', createdAt: '2024-11-01', mustChangePassword: true },

  // ── Hospital 5: Gandaravakottai PHC (HOS-PDK-005) ───────────────────
  { id: 'ustaff-ha5', name: 'Priya Shankar', email: 'priya@gphc.gov.in', role: 'hospital_admin', username: 'priya.pdk005', password: 'Admin@123', phone: '9840100005', facilityId: 'h5', status: 'active', createdAt: '2025-02-01', lastLogin: '2026-09-01', mustChangePassword: true },
  { id: 'ustaff-doc9', name: 'Dr. Senthil Kumar', email: 'senthild@gphc.gov.in', role: 'doctor', username: 'senthild.pdk009', password: 'Doctor@123', phone: '9840100109', facilityId: 'h5', departmentId: 'General Medicine', status: 'active', createdAt: '2025-03-01', mustChangePassword: true },
  { id: 'ustaff-doc10', name: 'Dr. Lakshmi P', email: 'lakshmi@gphc.gov.in', role: 'doctor', username: 'lakshmi.pdk010', password: 'Doctor@123', phone: '9840100110', facilityId: 'h5', departmentId: 'General Medicine', status: 'active', createdAt: '2025-03-01', mustChangePassword: true },
  { id: 'ustaff-hw5', name: 'Anitha V', email: 'anitha@gphc.gov.in', role: 'health_worker', username: 'anitha.pdk005', password: 'HW@12345', phone: '9840100205', facilityId: 'h5', status: 'active', createdAt: '2025-04-01', mustChangePassword: true },
];

// ---------------------------------------------------------------------------
// Referrals (with varied statuses to show the full lifecycle)
// ---------------------------------------------------------------------------
export const referrals: Referral[] = [
  {
    id: 'r1', referralId: 'REF-2026-001', patientId: 'p1', patientName: 'Lakshmi Devi',
    sourceFacilityId: 'h1', sourceFacilityName: 'Pudukkottai Government Hospital',
    destinationFacilityId: 'h1', destinationFacilityName: 'Pudukkottai Government Hospital',
    department: 'Cardiology', doctorId: 'd1', doctorName: 'Dr. Arun Kumar',
    priority: 'urgent', reason: 'Chest pain and irregular heartbeat detected during routine checkup. ECG shows arrhythmia.',
    status: 'closed', currentStep: 8, totalSteps: 8,
    appointmentDate: '2026-06-15', appointmentTime: '10:00',
    createdAt: '2026-06-10T09:00:00Z', updatedAt: '2026-06-22T14:30:00Z',
    closedAt: '2026-06-22T14:30:00Z', isOverdue: false,
  },
  {
    id: 'r2', referralId: 'REF-2026-002', patientId: 'p2', patientName: 'Raman Sharma',
    sourceFacilityId: 'h2', sourceFacilityName: 'Alangudi Primary Health Centre',
    destinationFacilityId: 'h3', destinationFacilityName: 'Aranthangi Community Health Centre',
    department: 'Surgery', doctorId: 'd5', doctorName: 'Dr. Mohan Prasad',
    priority: 'urgent', reason: 'Suspected fracture of left radius. X-ray required and possible casting.',
    status: 'patient_arrived', currentStep: 4, totalSteps: 8,
    appointmentDate: '2026-07-20', appointmentTime: '11:30',
    createdAt: '2026-07-18T08:00:00Z', updatedAt: '2026-07-20T11:00:00Z', isOverdue: false,
  },
  {
    id: 'r3', referralId: 'REF-2026-003', patientId: 'p3', patientName: 'Meena Kumari',
    sourceFacilityId: 'h1', sourceFacilityName: 'Pudukkottai Government Hospital',
    destinationFacilityId: 'h2', destinationFacilityName: 'Alangudi Primary Health Centre',
    department: 'Maternity', doctorId: 'd4', doctorName: 'Dr. Kavitha N',
    priority: 'routine', reason: 'Routine prenatal checkup with high-risk pregnancy indicators.',
    status: 'followup', currentStep: 7, totalSteps: 8,
    appointmentDate: '2026-07-25', appointmentTime: '09:00',
    createdAt: '2026-07-10T10:00:00Z', updatedAt: '2026-07-28T15:00:00Z', isOverdue: false,
  },
  {
    id: 'r4', referralId: 'REF-2026-004', patientId: 'p4', patientName: 'Murugan P',
    sourceFacilityId: 'h1', sourceFacilityName: 'Pudukkottai Government Hospital',
    destinationFacilityId: 'h1', destinationFacilityName: 'Pudukkottai Government Hospital',
    department: 'Cardiology', doctorId: 'd1', doctorName: 'Dr. Arun Kumar',
    priority: 'emergency', reason: 'Acute chest pain with shortness of breath. Suspected MI.',
    status: 'accepted', currentStep: 2, totalSteps: 8,
    createdAt: '2026-07-28T06:30:00Z', updatedAt: '2026-07-28T07:15:00Z', isOverdue: false,
  },
  {
    id: 'r5', referralId: 'REF-2026-005', patientId: 'p5', patientName: 'Priya R',
    sourceFacilityId: 'h2', sourceFacilityName: 'Alangudi Primary Health Centre',
    destinationFacilityId: 'h3', destinationFacilityName: 'Aranthangi Community Health Centre',
    department: 'General Medicine', priority: 'routine',
    reason: 'Persistent ear discharge for 2 weeks. Needs specialist evaluation.',
    status: 'scheduled', currentStep: 3, totalSteps: 8,
    appointmentDate: '2026-08-05', appointmentTime: '14:00',
    createdAt: '2026-07-25T11:00:00Z', updatedAt: '2026-07-27T09:00:00Z', isOverdue: false,
  },
  {
    id: 'r6', referralId: 'REF-2026-006', patientId: 'p6', patientName: 'Kumar S',
    sourceFacilityId: 'h1', sourceFacilityName: 'Pudukkottai Government Hospital',
    destinationFacilityId: 'h1', destinationFacilityName: 'Pudukkottai Government Hospital',
    department: 'General Medicine', priority: 'urgent',
    reason: 'Worsening COPD symptoms. Spirometry shows FEV1 < 40%. Needs specialist review.',
    status: 'created', currentStep: 1, totalSteps: 8,
    createdAt: '2026-07-29T08:00:00Z', updatedAt: '2026-07-29T08:00:00Z', isOverdue: false,
  },
  {
    id: 'r7', referralId: 'REF-2026-007', patientId: 'p7', patientName: 'Anitha V',
    sourceFacilityId: 'h2', sourceFacilityName: 'Alangudi Primary Health Centre',
    destinationFacilityId: 'h3', destinationFacilityName: 'Aranthangi Community Health Centre',
    department: 'General Medicine', doctorId: 'd5', doctorName: 'Dr. Mohan Prasad',
    priority: 'urgent', reason: 'Recurrent headaches with visual disturbances. Rule out intracranial pathology.',
    status: 'treatment', currentStep: 6, totalSteps: 8,
    appointmentDate: '2026-07-15', appointmentTime: '10:30',
    createdAt: '2026-07-12T09:30:00Z', updatedAt: '2026-07-20T16:00:00Z', isOverdue: false,
  },
  {
    id: 'r8', referralId: 'REF-2026-008', patientId: 'p8', patientName: 'Rajan M',
    sourceFacilityId: 'h4', sourceFacilityName: 'Illupur Government Hospital',
    destinationFacilityId: 'h5', destinationFacilityName: 'Gandaravakottai PHC',
    department: 'General Medicine', priority: 'routine',
    reason: 'Poorly controlled diabetes. HbA1c 11.2%. Needs specialist for insulin management.',
    status: 'consultation', currentStep: 5, totalSteps: 8,
    appointmentDate: '2026-07-22', appointmentTime: '11:00',
    createdAt: '2026-07-18T10:00:00Z', updatedAt: '2026-07-22T11:30:00Z', isOverdue: false,
  },
  {
    id: 'r9', referralId: 'REF-2026-009', patientId: 'p9', patientName: 'Sangeetha K',
    sourceFacilityId: 'h1', sourceFacilityName: 'Pudukkottai Government Hospital',
    destinationFacilityId: 'h4', destinationFacilityName: 'Illupur Government Hospital',
    department: 'Paediatrics', doctorId: 'd6', doctorName: 'Dr. Kamala Devi',
    priority: 'urgent', reason: 'Child with recurring febrile seizures. Needs pediatric neurologist opinion.',
    status: 'scheduled', currentStep: 3, totalSteps: 8,
    appointmentDate: '2026-07-30', appointmentTime: '09:30',
    createdAt: '2026-07-26T07:00:00Z', updatedAt: '2026-07-27T14:00:00Z', isOverdue: false,
  },
  {
    id: 'r10', referralId: 'REF-2026-010', patientId: 'p10', patientName: 'Vetri V',
    sourceFacilityId: 'h3', sourceFacilityName: 'Aranthangi Community Health Centre',
    destinationFacilityId: 'h5', destinationFacilityName: 'Gandaravakottai PHC',
    department: 'General Medicine', doctorId: 'd9', doctorName: 'Dr. Senthil Kumar',
    priority: 'routine', reason: 'Chronic knee pain. Suspected osteoarthritis. Needs evaluation.',
    status: 'accepted', currentStep: 2, totalSteps: 8,
    appointmentDate: '2026-08-02', appointmentTime: '15:00',
    createdAt: '2026-07-28T10:00:00Z', updatedAt: '2026-07-29T08:30:00Z', isOverdue: false,
  },
];

// ---------------------------------------------------------------------------
// Referral Events (timeline for REF-001 as an example of a completed referral)
// ---------------------------------------------------------------------------
export const referralEvents: ReferralEvent[] = [
  { id: 're1', referralId: 'r1', status: 'created', description: 'Referral created by Dr. Senthil Kumar at Kallikudi PHC', performedBy: 'Dr. Senthil Kumar', timestamp: '2026-06-10T09:00:00Z' },
  { id: 're2', referralId: 'r1', status: 'accepted', description: 'Referral accepted by Madurai District Hospital - Cardiology dept', performedBy: 'Hospital Admin', timestamp: '2026-06-10T14:00:00Z' },
  { id: 're3', referralId: 'r1', status: 'scheduled', description: 'Appointment scheduled for Jun 15, 10:00 AM with Dr. Rajesh Verma', performedBy: 'Dr. Rajesh Verma', timestamp: '2026-06-11T10:00:00Z' },
  { id: 're4', referralId: 'r1', status: 'patient_arrived', description: 'Patient arrived at hospital. QR code scanned at reception.', performedBy: 'Reception Desk', timestamp: '2026-06-15T09:45:00Z' },
  { id: 're5', referralId: 'r1', status: 'consultation', description: 'Consultation completed. Diagnosis: Atrial fibrillation. Prescribed Warfarin.', performedBy: 'Dr. Rajesh Verma', timestamp: '2026-06-15T10:30:00Z' },
  { id: 're6', referralId: 'r1', status: 'treatment', description: 'Treatment initiated. Medication started. Patient stable.', performedBy: 'Dr. Rajesh Verma', timestamp: '2026-06-15T11:00:00Z' },
  { id: 're7', referralId: 'r1', status: 'followup', description: 'Follow-up scheduled for Jun 22. Patient counseled on medication adherence.', performedBy: 'Dr. Rajesh Verma', timestamp: '2026-06-15T11:30:00Z' },
  { id: 're8', referralId: 'r1', status: 'closed', description: 'Follow-up completed. Patient responding well to treatment. Referral closed.', performedBy: 'Dr. Rajesh Verma', timestamp: '2026-06-22T14:30:00Z' },
];

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
export const appointments: Appointment[] = [
  { id: 'a1', patientId: 'p1', doctorId: 'd1', facilityId: 'h1', department: 'Cardiology', date: '2026-07-30', time: '10:00', status: 'scheduled', reason: 'Follow-up: Atrial fibrillation', createdAt: '2026-07-28' },
  { id: 'a2', patientId: 'p2', doctorId: 'd5', facilityId: 'h3', department: 'Surgery', date: '2026-07-20', time: '11:30', status: 'completed', reason: 'Left radius fracture evaluation', createdAt: '2026-07-18' },
  { id: 'a3', patientId: 'p3', doctorId: 'd4', facilityId: 'h2', department: 'Maternity', date: '2026-07-25', time: '09:00', status: 'completed', reason: 'Prenatal checkup', createdAt: '2026-07-10' },
  { id: 'a4', patientId: 'p5', doctorId: 'd2', facilityId: 'h1', department: 'General Medicine', date: '2026-08-05', time: '14:00', status: 'scheduled', reason: 'Persistent ear discharge', createdAt: '2026-07-25' },
  { id: 'a5', patientId: 'p8', doctorId: 'd9', facilityId: 'h5', department: 'General Medicine', date: '2026-07-22', time: '11:00', status: 'completed', reason: 'Diabetes management review', createdAt: '2026-07-18' },
  { id: 'a6', patientId: 'p9', doctorId: 'd6', facilityId: 'h3', department: 'Paediatrics', date: '2026-07-30', time: '09:30', status: 'scheduled', reason: 'Febrile seizure evaluation', createdAt: '2026-07-26' },
];

// ---------------------------------------------------------------------------
// Consultations
// ---------------------------------------------------------------------------
export const consultations: Consultation[] = [
  {
    id: 'c1', appointmentId: 'a2', patientId: 'p2', doctorId: 'd5',
    symptoms: ['Left wrist pain', 'Swelling', 'Limited movement'],
    diagnosis: 'Distal radius fracture (Colles fracture)',
    prescription: ['Calcium supplements', 'Analgesic - Ibuprofen 400mg', 'Arm sling'],
    notes: 'X-ray confirmed fracture. Cast applied. Follow-up in 6 weeks.',
    followupRequired: true, followupDate: '2026-08-31', createdAt: '2026-07-20',
  },
  {
    id: 'c2', appointmentId: 'a3', patientId: 'p3', doctorId: 'd4',
    symptoms: ['Abdominal discomfort', 'Mild cramping'],
    diagnosis: 'Normal pregnancy progression - 28 weeks',
    prescription: ['Iron supplements', 'Folic acid', 'Calcium'],
    notes: 'All vitals normal. Baby growth on track. Next visit in 2 weeks.',
    followupRequired: true, followupDate: '2026-08-08', createdAt: '2026-07-25',
  },
  {
    id: 'c3', appointmentId: 'a5', patientId: 'p8', doctorId: 'd9',
    symptoms: ['Frequent urination', 'Fatigue', 'Blurred vision'],
    diagnosis: 'Poorly controlled Type 2 Diabetes Mellitus',
    prescription: ['Metformin 500mg → 1000mg', 'Glimepiride 2mg', 'Insulin Glargine'],
    notes: 'HbA1c at 11.2%. Starting insulin therapy. Diet counseling provided.',
    followupRequired: true, followupDate: '2026-08-15', createdAt: '2026-07-22',
  },
];

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------
export const vitals: Vitals[] = [
  // Patient p1 (Lakshmi Devi) - vital history showing progression
  { id: 'v1', patientId: 'p1', recordedBy: 'Health Worker Suganthi', date: '2026-08-01', bloodPressureSystolic: 148, bloodPressureDiastolic: 92, heartRate: 85, temperature: 98.4, spO2: 96, weight: 68, bloodSugar: 142 },
  { id: 'v1b', patientId: 'p1', recordedBy: 'Health Worker Suganthi', date: '2026-08-15', bloodPressureSystolic: 150, bloodPressureDiastolic: 93, heartRate: 86, temperature: 98.4, spO2: 95, weight: 68, bloodSugar: 148 },
  { id: 'v1c', patientId: 'p1', recordedBy: 'Dr. Senthil Kumar', date: '2026-09-01', bloodPressureSystolic: 152, bloodPressureDiastolic: 95, heartRate: 88, temperature: 98.4, spO2: 96, weight: 68, bloodSugar: 145 },
  // Patient p2 (Raman Sharma)
  { id: 'v2', patientId: 'p2', recordedBy: 'Health Worker Suganthi', date: '2026-08-10', bloodPressureSystolic: 130, bloodPressureDiastolic: 84, heartRate: 78, temperature: 98.6, weight: 72 },
  { id: 'v2b', patientId: 'p2', recordedBy: 'Nurse', date: '2026-09-01', bloodPressureSystolic: 128, bloodPressureDiastolic: 82, heartRate: 76, temperature: 98.6, weight: 72 },
  // Patient p3 (Meena Kumari)
  { id: 'v3', patientId: 'p3', recordedBy: 'Dr. Kamala Devi', date: '2026-08-25', bloodPressureSystolic: 118, bloodPressureDiastolic: 75, heartRate: 82, temperature: 98.2, weight: 63 },
  // Patient p4 (Murugan P) - emergency case
  { id: 'v4', patientId: 'p4', recordedBy: 'Health Worker Suganthi', date: '2026-08-20', bloodPressureSystolic: 165, bloodPressureDiastolic: 100, heartRate: 102, temperature: 99.0, spO2: 93, bloodSugar: 175 },
  { id: 'v4b', patientId: 'p4', recordedBy: 'Dr. Senthil Kumar', date: '2026-09-01', bloodPressureSystolic: 168, bloodPressureDiastolic: 102, heartRate: 105, temperature: 99.1, spO2: 92, bloodSugar: 180 },
  // Patient p6 (Kumar S)
  { id: 'v6', patientId: 'p6', recordedBy: 'Health Worker Suganthi', date: '2026-08-15', bloodPressureSystolic: 142, bloodPressureDiastolic: 90, heartRate: 82, temperature: 98.6, spO2: 94 },
  // Patient p8 (Rajan M)
  { id: 'v5', patientId: 'p8', recordedBy: 'Dr. Mohan Prasad', date: '2026-08-22', bloodPressureSystolic: 135, bloodPressureDiastolic: 86, heartRate: 78, temperature: 98.6, bloodSugar: 240 },
  { id: 'v5b', patientId: 'p8', recordedBy: 'Dr. Mohan Prasad', date: '2026-09-01', bloodPressureSystolic: 138, bloodPressureDiastolic: 88, heartRate: 80, temperature: 98.6, bloodSugar: 245 },
];

// ---------------------------------------------------------------------------
// Health Records
// ---------------------------------------------------------------------------
export const healthRecords: HealthRecord[] = [
  { id: 'hr1', patientId: 'p1', type: 'consultation', title: 'Cardiology Consultation', description: 'Diagnosed with Atrial Fibrillation. Started on Warfarin.', facilityName: 'Pudukkottai Government Hospital', doctorName: 'Dr. Arun Kumar', date: '2026-06-15' },
  { id: 'hr2', patientId: 'p1', type: 'lab_report', title: 'ECG Report', description: 'Irregular rhythm detected. Atrial fibrillation confirmed.', facilityName: 'Pudukkottai Government Hospital', date: '2026-06-15' },
  { id: 'hr3', patientId: 'p1', type: 'prescription', title: 'Warfarin Prescription', description: 'Warfarin 5mg daily, INR monitoring monthly', facilityName: 'Pudukkottai Government Hospital', doctorName: 'Dr. Arun Kumar', date: '2026-06-15' },
  { id: 'hr4', patientId: 'p1', type: 'consultation', title: 'Follow-up Visit', description: 'INR within range. Continue current medication.', facilityName: 'Pudukkottai Government Hospital', doctorName: 'Dr. Arun Kumar', date: '2026-06-22' },
  { id: 'hr5', patientId: 'p2', type: 'consultation', title: 'Surgery Consultation', description: 'Colles fracture confirmed. Cast applied.', facilityName: 'Aranthangi Community Health Centre', doctorName: 'Dr. Mohan Prasad', date: '2026-07-20' },
  { id: 'hr6', patientId: 'p3', type: 'consultation', title: 'Prenatal Checkup', description: 'Normal pregnancy at 28 weeks. All parameters within range.', facilityName: 'Alangudi Primary Health Centre', doctorName: 'Dr. Kavitha N', date: '2026-07-25' },
];

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------
export const followups: Followup[] = [
  { id: 'fu1', referralId: 'r1', patientId: 'p1', patientName: 'Lakshmi Devi', doctorId: 'd1', doctorName: 'Dr. Arun Kumar', facilityName: 'Pudukkottai Government Hospital', scheduledDate: '2026-06-22', scheduledTime: '10:00', status: 'completed', reason: 'INR monitoring and medication review', createdAt: '2026-06-15' },
  { id: 'fu2', referralId: 'r3', patientId: 'p3', patientName: 'Meena Kumari', doctorId: 'd4', doctorName: 'Dr. Kavitha N', facilityName: 'Alangudi Primary Health Centre', scheduledDate: '2026-08-08', scheduledTime: '09:00', status: 'scheduled', reason: 'Prenatal checkup - 32 weeks', missedFollowupRisk: 22, createdAt: '2026-07-25' },
  { id: 'fu3', referralId: 'r5', patientId: 'p5', patientName: 'Priya R', doctorId: 'd2', doctorName: 'Dr. Priya Sharma', facilityName: 'Pudukkottai Government Hospital', scheduledDate: '2026-08-12', scheduledTime: '14:00', status: 'scheduled', reason: 'General medicine follow-up after initial evaluation', missedFollowupRisk: 45, createdAt: '2026-07-25' },
  { id: 'fu4', referralId: 'r7', patientId: 'p7', patientName: 'Anitha V', doctorId: 'd5', doctorName: 'Dr. Mohan Prasad', facilityName: 'Aranthangi Community Health Centre', scheduledDate: '2026-07-28', scheduledTime: '10:30', status: 'missed', reason: 'Post-treatment review for neurological symptoms', missedFollowupRisk: 68, createdAt: '2026-07-20' },
];

// ---------------------------------------------------------------------------
// Medicine Stock
// ---------------------------------------------------------------------------
export const medicineStock: MedicineStock[] = [
  { id: 'ms1', medicineId: 'm1', medicineName: 'Paracetamol 500mg', facilityId: 'h1', facilityName: 'Pudukkottai Government Hospital', quantity: 500, unit: 'tablets', expiryDate: '2027-06', status: 'in_stock' },
  { id: 'ms2', medicineId: 'm2', medicineName: 'Metformin 500mg', facilityId: 'h1', facilityName: 'Pudukkottai Government Hospital', quantity: 120, unit: 'tablets', expiryDate: '2027-03', status: 'in_stock' },
  { id: 'ms3', medicineId: 'm3', medicineName: 'Amlodipine 5mg', facilityId: 'h2', facilityName: 'Alangudi Primary Health Centre', quantity: 30, unit: 'tablets', expiryDate: '2026-12', status: 'low_stock' },
  { id: 'ms4', medicineId: 'm4', medicineName: 'Amoxicillin 250mg', facilityId: 'h2', facilityName: 'Alangudi Primary Health Centre', quantity: 300, unit: 'capsules', expiryDate: '2027-01', status: 'in_stock' },
  { id: 'ms5', medicineId: 'm5', medicineName: 'Insulin Glargine', facilityId: 'h3', facilityName: 'Aranthangi Community Health Centre', quantity: 45, unit: 'vials', expiryDate: '2026-11', status: 'in_stock' },
  { id: 'ms6', medicineId: 'm6', medicineName: 'Warfarin 5mg', facilityId: 'h3', facilityName: 'Aranthangi Community Health Centre', quantity: 0, unit: 'tablets', expiryDate: '2027-04', status: 'out_of_stock' },
  { id: 'ms7', medicineId: 'm7', medicineName: 'Salbutamol Inhaler', facilityId: 'h4', facilityName: 'Illupur Government Hospital', quantity: 8, unit: 'inhalers', expiryDate: '2026-09', status: 'low_stock' },
  { id: 'ms8', medicineId: 'm8', medicineName: 'Omeprazole 20mg', facilityId: 'h5', facilityName: 'Gandaravakottai PHC', quantity: 200, unit: 'capsules', expiryDate: '2027-05', status: 'in_stock' },
];

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
export const diagnostics: Diagnostic[] = [
  { id: 'dg1', name: 'Complete Blood Count', category: 'Blood', facilityId: 'h1', facilityName: 'Pudukkottai Government Hospital', available: true, waitTime: 1, cost: 150 },
  { id: 'dg2', name: 'ECG', category: 'Cardiac', facilityId: 'h1', facilityName: 'Pudukkottai Government Hospital', available: true, waitTime: 0, cost: 200 },
  { id: 'dg3', name: 'Chest X-Ray', category: 'Radiology', facilityId: 'h2', facilityName: 'Alangudi Primary Health Centre', available: true, waitTime: 1, cost: 300 },
  { id: 'dg4', name: 'CT Scan', category: 'Radiology', facilityId: 'h3', facilityName: 'Aranthangi Community Health Centre', available: true, waitTime: 3, cost: 2500 },
  { id: 'dg5', name: 'MRI Brain', category: 'Radiology', facilityId: 'h3', facilityName: 'Aranthangi Community Health Centre', available: true, waitTime: 5, cost: 5000 },
  { id: 'dg6', name: 'Thyroid Profile', category: 'Blood', facilityId: 'h4', facilityName: 'Illupur Government Hospital', available: true, waitTime: 2, cost: 400 },
  { id: 'dg7', name: 'HbA1c', category: 'Blood', facilityId: 'h5', facilityName: 'Gandaravakottai PHC', available: true, waitTime: 1, cost: 350 },
  { id: 'dg8', name: 'Ultrasound Abdomen', category: 'Radiology', facilityId: 'h2', facilityName: 'Alangudi Primary Health Centre', available: false, waitTime: 7, cost: 600 },
];

// ---------------------------------------------------------------------------
// Village Access Scores
// ---------------------------------------------------------------------------
export const villageAccessScores: VillageAccessScore[] = [
  { villageId: 'v1', villageName: 'Kallikudi', district: 'Madurai', latitude: 10.05, longitude: 78.12, overallScore: 62, distanceToFacility: 3.2, facilityCapacity: 55, specialistAvailability: 35, diagnosticAvailability: 50, medicineAvailability: 65, averageWaitTime: 25, accessLevel: 'moderate', population: 8500 },
  { villageId: 'v2', villageName: 'Thoor', district: 'Madurai', latitude: 10.08, longitude: 78.15, overallScore: 78, distanceToFacility: 2.1, facilityCapacity: 72, specialistAvailability: 65, diagnosticAvailability: 70, medicineAvailability: 80, averageWaitTime: 40, accessLevel: 'good', population: 12000 },
  { villageId: 'v3', villageName: 'Melur', district: 'Madurai', latitude: 9.97, longitude: 78.28, overallScore: 71, distanceToFacility: 5.5, facilityCapacity: 68, specialistAvailability: 55, diagnosticAvailability: 62, medicineAvailability: 72, averageWaitTime: 35, accessLevel: 'moderate', population: 15000 },
  { villageId: 'v4', villageName: 'Vadipatti', district: 'Madurai', latitude: 10.02, longitude: 78.08, overallScore: 45, distanceToFacility: 8.3, facilityCapacity: 40, specialistAvailability: 25, diagnosticAvailability: 30, medicineAvailability: 50, averageWaitTime: 55, accessLevel: 'underserved', population: 6500 },
  { villageId: 'v5', villageName: 'Usilampatti', district: 'Madurai', latitude: 9.97, longitude: 77.95, overallScore: 38, distanceToFacility: 12.1, facilityCapacity: 35, specialistAvailability: 20, diagnosticAvailability: 25, medicineAvailability: 40, averageWaitTime: 70, accessLevel: 'underserved', population: 5200 },
  { villageId: 'v6', villageName: 'Sedapatti', district: 'Madurai', latitude: 10.10, longitude: 78.05, overallScore: 52, distanceToFacility: 7.8, facilityCapacity: 45, specialistAvailability: 30, diagnosticAvailability: 40, medicineAvailability: 55, averageWaitTime: 48, accessLevel: 'underserved', population: 4800 },
  { villageId: 'v7', villageName: 'Peraiyur', district: 'Madurai', latitude: 9.92, longitude: 78.20, overallScore: 82, distanceToFacility: 1.8, facilityCapacity: 80, specialistAvailability: 70, diagnosticAvailability: 75, medicineAvailability: 88, averageWaitTime: 20, accessLevel: 'good', population: 9200 },
  { villageId: 'v8', villageName: 'Alangudi', district: 'Madurai', latitude: 10.15, longitude: 78.22, overallScore: 28, distanceToFacility: 15.5, facilityCapacity: 25, specialistAvailability: 15, diagnosticAvailability: 20, medicineAvailability: 35, averageWaitTime: 90, accessLevel: 'underserved', population: 3500 },
];

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export const notifications: Notification[] = [
  { id: 'n1', userId: 'u1', title: 'Follow-up Reminder', message: 'Your follow-up appointment with Dr. Arun Kumar is scheduled for Jul 30 at 10:00 AM.', type: 'info', read: false, createdAt: '2026-07-28T08:00:00Z' },
  { id: 'n2', userId: 'u1', title: 'Prescription Refill', message: 'Your Warfarin prescription may need a refill in 5 days.', type: 'warning', read: false, createdAt: '2026-07-27T09:00:00Z' },
  { id: 'n3', userId: 'u1', title: 'Referral Update', message: 'Your referral REF-2026-001 has been closed. Treatment completed successfully.', type: 'success', read: true, createdAt: '2026-06-22T14:30:00Z' },
  { id: 'n4', userId: 'uhw1', title: 'Overdue Follow-up', message: 'Patient Anitha V missed her follow-up appointment. Please follow up.', type: 'alert', read: false, createdAt: '2026-07-29T07:00:00Z' },
  { id: 'n5', userId: 'uhw1', title: 'New Referral Created', message: 'A new urgent referral (REF-2026-006) has been created for Kumar S.', type: 'info', read: false, createdAt: '2026-07-29T08:05:00Z' },
  { id: 'n6', userId: 'uhw1', title: 'High Risk Patient', message: 'Patient Murugan P has been triaged as EMERGENCY. Immediate attention required.', type: 'alert', read: false, createdAt: '2026-07-28T06:35:00Z' },
];

// ---------------------------------------------------------------------------
// Referral Predictions (AI)
// ---------------------------------------------------------------------------
export const referralPredictions: ReferralPrediction[] = [
  { referralId: 'r5', completionProbability: 62, riskLevel: 'medium', riskFactors: ['Distance: 15km to hospital', 'Patient has no transport', 'Previous 1 missed appointment'], recommendedAction: 'Health-worker phone reminder 2 days before appointment' },
  { referralId: 'r9', completionProbability: 38, riskLevel: 'high', riskFactors: ['Distance: 22km to hospital', 'No public transport available', 'Working day appointment', 'Patient income: daily wage'], recommendedAction: 'Health-worker home visit + arrange transport assistance' },
  { referralId: 'r10', completionProbability: 75, riskLevel: 'low', riskFactors: ['Moderate distance 12km', 'Patient has family support'], recommendedAction: 'Standard SMS reminder 24 hours before appointment' },
  { referralId: 'r4', completionProbability: 88, riskLevel: 'low', riskFactors: ['Emergency case - high motivation', 'Short distance 5km'], recommendedAction: 'No intervention required' },
];

// ---------------------------------------------------------------------------
// District Analytics
// ---------------------------------------------------------------------------
export const districtAnalytics: DistrictAnalytics = {
  totalPatients: 12450,
  totalReferrals: 3420,
  referralClosureRate: 82.5,
  averageWaitingTime: 4.2,
  missedFollowups: 215,
  highRiskPending: 48,
  facilitiesOperational: 23,
  totalBeds: 890,
  occupiedBeds: 645,
  specialistsOnDuty: 52,
  diagnosticsAvailable: 18,
  medicinesInStock: 342,
  lowStockMedicines: 28,
  ruralAccessScore: 61.3,
};

// ---------------------------------------------------------------------------
// Referral Funnel Data
// ---------------------------------------------------------------------------
export const referralFunnel: ReferralFunnelStage[] = [
  { stage: 'Referrals Created', count: 3420, percentage: 100 },
  { stage: 'Hospital Accepted', count: 3180, percentage: 93.0 },
  { stage: 'Appointment Scheduled', count: 2950, percentage: 86.3 },
  { stage: 'Patient Arrived', count: 2680, percentage: 78.4 },
  { stage: 'Consultation Done', count: 2520, percentage: 73.7 },
  { stage: 'Treatment Started', count: 2410, percentage: 70.5 },
  { stage: 'Follow-up Completed', count: 2180, percentage: 63.7 },
  { stage: 'Referral Closed', count: 2020, percentage: 59.1 },
];

// ---------------------------------------------------------------------------
// AI Insights (Government Dashboard)
// ---------------------------------------------------------------------------
export const aiInsights: InsightCard[] = [
  { id: 'ins1', type: 'alert', title: 'Critical Medicine Shortage', description: 'Warfarin is out of stock at Madurai District Hospital. 12 patients currently on Warfarin therapy need immediate supply arrangement.', metric: '0 vials remaining', priority: 'high' },
  { id: 'ins2', type: 'warning', title: 'Rising Missed Follow-ups in Vadipatti Block', description: 'Missed follow-up rate in Vadipatti has increased by 15% this month. 8 patients missed appointments. Consider deploying a health worker for door-to-door follow-up.', metric: '32% miss rate', priority: 'high' },
  { id: 'ins3', type: 'recommendation', title: 'Alangudi Village Underserved', description: 'Alangudi village has the lowest Healthcare Access Score (28/100). 15.5km to nearest facility. Recommend establishing a monthly health camp.', metric: 'Score: 28/100', priority: 'medium' },
  { id: 'ins4', type: 'info', title: 'Cardiology Referral Surge', description: 'Cardiology referrals increased 23% in July compared to June. Consider adding a visiting cardiologist at Thoor CHC to reduce load on District Hospital.', metric: '+23% month-over-month', priority: 'low' },
  { id: 'ins5', type: 'recommendation', title: 'Telemedicine Opportunity', description: 'Based on referral patterns, 35% of specialist consultations could be handled via telemedicine, reducing patient travel time by an average of 2.3 hours per visit.', metric: '35% convertible', priority: 'medium' },
];

// ---------------------------------------------------------------------------
// Monthly Referral Trends (for charts)
// ---------------------------------------------------------------------------
export const monthlyReferralTrends = [
  { month: 'Jan', created: 280, closed: 245, missed: 18 },
  { month: 'Feb', created: 310, closed: 272, missed: 22 },
  { month: 'Mar', created: 295, closed: 260, missed: 20 },
  { month: 'Apr', created: 340, closed: 298, missed: 25 },
  { month: 'May', created: 325, closed: 290, missed: 19 },
  { month: 'Jun', created: 355, closed: 315, missed: 16 },
  { month: 'Jul', created: 370, closed: 320, missed: 28 },
];

// ---------------------------------------------------------------------------
// Facility-wise Performance
// ---------------------------------------------------------------------------
export const facilityPerformance = [
  { facility: 'Kallikudi PHC', closureRate: 88, avgWait: 25, referrals: 420 },
  { facility: 'Thoor CHC', closureRate: 85, avgWait: 40, referrals: 680 },
  { facility: 'Madurai DH', closureRate: 82, avgWait: 55, referrals: 1250 },
  { facility: 'Melur GH', closureRate: 79, avgWait: 35, referrals: 520 },
  { facility: 'Meenakshi MC', closureRate: 91, avgWait: 75, referrals: 550 },
];

// ---------------------------------------------------------------------------
// Demo Patient (for the primary demo journey)
// ---------------------------------------------------------------------------
export const demoPatient = patients[0]; // Lakshmi Devi
export const demoReferral = referrals[0]; // REF-2026-001 (completed)
export const demoActiveReferral = referrals[3]; // REF-2026-004 (emergency)

// ---------------------------------------------------------------------------
// Quick helper: Get patient by ID
// ---------------------------------------------------------------------------
export function getPatientById(id: string): Patient | undefined {
  return patients.find(p => p.id === id);
}

export function getDoctorById(id: string): Doctor | undefined {
  return doctors.find(d => d.id === id);
}

export function getFacilityById(id: string): Facility | undefined {
  return facilities.find(f => f.id === id);
}

export function getReferralsForPatient(patientId: string): Referral[] {
  return referrals.filter(r => r.patientId === patientId);
}

export function getReferralsForFacility(facilityId: string): Referral[] {
  return referrals.filter(r => r.destinationFacilityId === facilityId);
}

export function getAppointmentsForDoctor(doctorId: string): Appointment[] {
  return appointments.filter(a => a.doctorId === doctorId);
}

export function getFollowupsForPatient(patientId: string): Followup[] {
  return followups.filter(f => f.patientId === patientId);
}

// ---------------------------------------------------------------------------
// Hospitals (managed by District Administrator)
// ---------------------------------------------------------------------------
export const hospitals: Hospital[] = [
  {
    id: 'h1', hospitalId: 'HOS-PDK-001', name: 'Pudukkottai Government Hospital',
    type: 'government', address: '12 Anna Salai, Pudukkottai',
    district: 'Pudukkottai', state: 'Tamil Nadu',
    phone: '04322-222000', email: 'pgsh@tn.gov.in',
    departments: ['General Medicine', 'Cardiology', 'Orthopaedics', 'Paediatrics', 'Obstetrics', 'ENT'],
    services: ['OPD', 'IPD', 'Emergency', 'Surgery', 'ICU', 'Laboratory', 'Pharmacy'],
    totalBeds: 200, occupiedBeds: 142, status: 'active',
    adminUserId: 'ustaff-ha1', createdByUserId: 'uga1',
    adminName: 'Rajesh Kumar', adminUsername: 'rajesh.pdk001', adminEmail: 'rajesh@pgsh.gov.in', adminPhone: '9840100001',
    createdAt: '2024-03-15',
  },
  {
    id: 'h2', hospitalId: 'HOS-PDK-002', name: 'Alangudi Primary Health Centre',
    type: 'government', address: '5 Main Road, Alangudi',
    district: 'Pudukkottai', state: 'Tamil Nadu',
    phone: '04322-233000', email: 'aphc@tn.gov.in',
    departments: ['General Medicine', 'Maternity'],
    services: ['OPD', 'Emergency', 'Laboratory', 'Pharmacy'],
    totalBeds: 30, occupiedBeds: 18, status: 'active',
    adminUserId: 'ustaff-ha2', createdByUserId: 'uga1',
    adminName: 'Meena Devi', adminUsername: 'meena.pdk002', adminEmail: 'meena@aphc.gov.in', adminPhone: '9840100002',
    createdAt: '2024-06-20',
  },
  {
    id: 'h3', hospitalId: 'HOS-PDK-003', name: 'Aranthangi Community Health Centre',
    type: 'government', address: '22 Hospital Road, Aranthangi',
    district: 'Pudukkottai', state: 'Tamil Nadu',
    phone: '04322-244000', email: 'achc@tn.gov.in',
    departments: ['General Medicine', 'Surgery', 'Paediatrics'],
    services: ['OPD', 'IPD', 'Emergency', 'Surgery', 'Laboratory', 'Pharmacy'],
    totalBeds: 60, occupiedBeds: 41, status: 'active',
    adminUserId: 'ustaff-ha3', createdByUserId: 'uga1',
    adminName: 'Senthil Murugan', adminUsername: 'senthil.pdk003', adminEmail: 'senthil@achc.gov.in', adminPhone: '9840100003',
    createdAt: '2024-01-10',
  },
  {
    id: 'h4', hospitalId: 'HOS-PDK-004', name: 'Illupur Government Hospital',
    type: 'government', address: '8 District Road, Illupur',
    district: 'Pudukkottai', state: 'Tamil Nadu',
    phone: '04322-255000', email: 'igh@tn.gov.in',
    departments: ['General Medicine', 'Orthopaedics'],
    services: ['OPD', 'Emergency', 'Laboratory', 'Pharmacy'],
    totalBeds: 40, occupiedBeds: 25, status: 'active',
    adminUserId: 'ustaff-ha4', createdByUserId: 'uga1',
    adminName: 'Kavitha R', adminUsername: 'kavitha.pdk004', adminEmail: 'kavitha@igh.gov.in', adminPhone: '9840100004',
    createdAt: '2024-09-01',
  },
  {
    id: 'h5', hospitalId: 'HOS-PDK-005', name: 'Gandaravakottai PHC',
    type: 'government', address: '3 Village Road, Gandaravakottai',
    district: 'Pudukkottai', state: 'Tamil Nadu',
    phone: '04322-266000', email: 'gphc@tn.gov.in',
    departments: ['General Medicine'],
    services: ['OPD', 'Emergency', 'Pharmacy'],
    totalBeds: 15, occupiedBeds: 8, status: 'active',
    adminUserId: 'ustaff-ha5', createdByUserId: 'uga1',
    adminName: 'Priya Shankar', adminUsername: 'priya.pdk005', adminEmail: 'priya@gphc.gov.in', adminPhone: '9840100005',
    createdAt: '2025-02-01',
  },
];
