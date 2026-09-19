// ============================================================================
// AarogyaLink - Centralized Data Store
// All dashboards read/write from this single source of truth.
// Analytics are computed dynamically from actual data.
// ============================================================================

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { DATA_VERSION, wrapForCloud, unwrapFromCloud } from './cloudData';
import type {
  Patient, Doctor, Facility, Referral, Appointment, Followup,
  HealthWorker, Vitals, HealthRecord, MedicineStock, Diagnostic,
  VillageAccessScore, Notification, ReferralEvent, Consultation,
  ReferralPrediction, ReferralStatus, AppointmentStatus, FollowupStatus,
  DistrictAnalytics, ReferralFunnelStage, Role, User, Hospital
} from '@/types';

// Initial data from mock-data
import {
  patients as initPatients,
  doctors as initDoctors,
  facilities as initFacilities,
  referrals as initReferrals,
  appointments as initAppointments,
  followups as initFollowups,
  healthWorkers as initHealthWorkers,
  vitals as initVitals,
  healthRecords as initHealthRecords,
  medicineStock as initMedicineStock,
  diagnostics as initDiagnostics,
  villageAccessScores as initVillageScores,
  notifications as initNotifications,
  referralEvents as initReferralEvents,
  consultations as initConsultations,
  referralPredictions as initPredictions,
  aiInsights as initInsights,
  staffUsers as initStaffUsers,
  hospitals as initHospitals,
} from '@/lib/mock-data';

// Valid referral status transitions
const REFERRAL_STEP_MAP: Record<ReferralStatus, number> = {
  created: 1,
  accepted: 2,
  scheduled: 3,
  patient_arrived: 4,
  consultation: 5,
  treatment: 6,
  followup: 7,
  closed: 8,
};

interface DataContextValue {
  // Data
  patients: Patient[];
  doctors: Doctor[];
  facilities: Facility[];
  referrals: Referral[];
  appointments: Appointment[];
  followups: Followup[];
  healthWorkers: HealthWorker[];
  vitals: Vitals[];
  healthRecords: HealthRecord[];
  medicineStock: MedicineStock[];
  diagnostics: Diagnostic[];
  villageAccessScores: VillageAccessScore[];
  notifications: Notification[];
  staffUsers: User[];
  hospitals: Hospital[];
  referralEvents: ReferralEvent[];
  consultations: Consultation[];
  referralPredictions: ReferralPrediction[];
  aiInsights: typeof initInsights;

  // Computed analytics (dynamically derived from actual data)
  districtAnalytics: DistrictAnalytics;
  referralFunnel: ReferralFunnelStage[];

  // Referral actions
  acceptReferral: (referralId: string) => void;
  rejectReferral: (referralId: string) => void;
  scheduleReferral: (referralId: string, date: string, time: string) => void;
  confirmArrival: (referralId: string) => void;
  startConsultation: (referralId: string) => void;
  completeConsultation: (referralId: string) => void;
  addTreatment: (referralId: string) => void;
  scheduleFollowup: (referralId: string, date: string, time: string) => void;
  createFollowup: (data: Omit<Followup, 'id' | 'createdAt'>) => void;
  completeFollowup: (referralId: string) => void;
  completeFollowupById: (followupId: string) => void;
  markFollowupMissed: (followupId: string) => void;
  closeReferral: (referralId: string) => void;
  createReferral: (data: Omit<Referral, 'id' | 'referralId' | 'status' | 'currentStep' | 'totalSteps' | 'createdAt' | 'updatedAt' | 'isOverdue'>) => void;

  // Appointment actions
  bookAppointment: (data: Omit<Appointment, 'id' | 'createdAt'>) => void;
  cancelAppointment: (appointmentId: string) => void;
  completeAppointment: (appointmentId: string) => void;

  // Patient actions
  addPatient: (data: Omit<Patient, 'id' | 'userId' | 'createdAt' | 'healthCardId' | 'registeredAt'>) => Patient;
  addDoctor: (data: Omit<Doctor, 'id'>) => { doctor: Doctor; credentials: { doctorId: string; username: string; tempPassword: string } };
  addHealthWorker: (data: Omit<HealthWorker, 'id'>) => { hw: HealthWorker; credentials: { hwId: string; username: string; tempPassword: string } };
  addVitals: (data: Omit<Vitals, 'id'>) => void;
  addHealthRecord: (data: Omit<HealthRecord, 'id'>) => void;
  addConsultation: (data: Omit<Consultation, 'id'>) => void;

  // Notification actions
  addNotification: (data: Omit<Notification, 'id' | 'createdAt'>) => void;
  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: (userId: string) => void;
  getNotificationsForUser: (userId: string) => Notification[];

  // Medicine stock
  updateMedicineStock: (stockId: string, quantity: number) => void;
  addMedicineStock: (data: Omit<MedicineStock, 'id'>) => void;
  removeMedicineStock: (stockId: string) => void;

  // Staff management
  addStaffUser: (data: Omit<User, 'id' | 'createdAt'>) => User;
  updateStaffUser: (userId: string, data: Partial<User>) => void;
  disableStaffUser: (userId: string) => void;
  enableStaffUser: (userId: string) => void;
  removeStaffUser: (userId: string) => void;
  getStaffByFacility: (facilityId: string) => User[];
  getStaffByRole: (role: Role) => User[];

  // Hospital management (District Admin)
  addHospital: (data: Omit<Hospital, 'id' | 'hospitalId' | 'createdAt'>) => { hospital: Hospital; adminCredentials: { adminUserId: string; adminId: string; username: string; tempPassword: string } };
  updateHospital: (hospitalId: string, data: Partial<Hospital>) => void;
  toggleHospitalStatus: (hospitalId: string) => void;
  removeHospital: (hospitalId: string) => void;

  // Helpers
  getPatientById: (id: string) => Patient | undefined;
  getPatientByEmail: (email: string) => Patient | undefined;
  getPatientByHealthCardId: (healthCardId: string) => Patient | undefined;
  getDoctorById: (id: string) => Doctor | undefined;
  getFacilityById: (id: string) => Facility | undefined;
  getReferralsForPatient: (patientId: string) => Referral[];
  getReferralsForFacility: (facilityId: string) => Referral[];
  getAppointmentsForDoctor: (doctorId: string) => Appointment[];
  getAppointmentsForPatient: (patientId: string) => Appointment[];
  getFollowupsForPatient: (patientId: string) => Followup[];
  getFollowupsForDoctor: (doctorId: string) => Followup[];
  getReferralEvents: (referralId: string) => ReferralEvent[];
  getVitalsForPatient: (patientId: string) => Vitals[];
  getHealthRecordsForPatient: (patientId: string) => HealthRecord[];
  getConsultationsForPatient: (patientId: string) => Consultation[];
  getPredictionForReferral: (referralId: string) => ReferralPrediction | undefined;
}

const DataContext = createContext<DataContextValue | null>(null);

let nextReferralNum = 11;
let nextPatientId = 11;
let nextNotifId = 7;
let nextHospitalNum = 6; // starts at 6 to avoid collision with h1-h5 mock data
let nextHANum = 6; // starts at 6 (hospitals 1-5 already have admins)
let nextDoctorNum = 11; // starts at 11 (d1-d10 already exist)
let nextHWNum = 6; // starts at 6 (hw1-hw5 already exist)

// ── ID Generation (PDK format) ─────────────────────────────────
export function generateHospitalId(num: number) {
  return `HOS-PDK-${String(num).padStart(3, '0')}`;
}
export function generateAdminId(num: number) {
  return `HA-PDK-${String(num).padStart(3, '0')}`;
}
export function generateDoctorId(num: number) {
  return `DOC-PDK-${String(num).padStart(3, '0')}`;
}
export function generateHWId(num: number) {
  return `HW-PDK-${String(num).padStart(3, '0')}`;
}
export function generatePatientId(num: number) {
  return `PAT-PDK-${String(num).padStart(4, '0')}`;
}
export function generateHealthCardId(num: number) {
  return `HC-PDK-${String(num).padStart(4, '0')}`;
}
export function generateReferralId(num: number) {
  return `REF-PDK-${String(num).padStart(4, '0')}`;
}

// ── Temporary Password Generation ───────────────────────────────
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  const arr = new Uint8Array(10);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < 10; i++) pw += chars[arr[i] % chars.length];
  } else {
    for (let i = 0; i < 10; i++) pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure at least one uppercase, one lowercase, one digit
  if (!/[A-Z]/.test(pw)) pw = 'A' + pw.slice(1);
  if (!/[a-z]/.test(pw)) pw = pw.slice(0, 1) + 'a' + pw.slice(2);
  if (!/[0-9]/.test(pw)) pw = pw.slice(0, 2) + '7' + pw.slice(3);
  return pw;
}

// Clear stale local cache when the shared-data version changes so every
// device reloads fresh seed data instead of an outdated cache.
// (The shared version itself lives in cloudData.ts)
try {
  const LOCAL_VERSION_KEY = 'aal_data_version';
  if (localStorage.getItem(LOCAL_VERSION_KEY) !== DATA_VERSION) {
    Object.keys(localStorage)
      .filter(k => k.startsWith('aal_'))
      .forEach(k => localStorage.removeItem(k));
    localStorage.setItem(LOCAL_VERSION_KEY, DATA_VERSION);
  }
} catch { /* ignore */ }

// ── localStorage persistence helpers ──────────────────────────────
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`aal_${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T) {
  try {
    localStorage.setItem(`aal_${key}`, JSON.stringify(data));
  } catch { /* quota exceeded or private mode — silently ignore */ }
}

// Keys of collections shared through Convex (see collectionRegistry below)
type CloudCollectionKey =
  | 'patients' | 'doctors' | 'healthWorkers' | 'staffUsers' | 'hospitals'
  | 'referrals' | 'appointments' | 'followups' | 'notifications' | 'referralEvents'
  | 'consultations' | 'vitals' | 'healthRecords' | 'medicineStock'
  | 'diagnostics' | 'villageAccessScores' | 'referralPredictions';

export function DataProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>(() => loadFromStorage('patients', initPatients));
  const [doctorsList, setDoctorsList] = useState<Doctor[]>(() => loadFromStorage('doctors', initDoctors));
  const [healthWorkersList, setHealthWorkersList] = useState<HealthWorker[]>(() => loadFromStorage('healthWorkers', initHealthWorkers));
  const [referrals, setReferrals] = useState<Referral[]>(() => loadFromStorage('referrals', initReferrals));
  const [appointments, setAppointments] = useState<Appointment[]>(() => loadFromStorage('appointments', initAppointments));
  const [followups, setFollowups] = useState<Followup[]>(() => loadFromStorage('followups', initFollowups));
  const [notifications, setNotifications] = useState<Notification[]>(() => loadFromStorage('notifications', initNotifications));
  const [referralEvents, setReferralEvents] = useState<ReferralEvent[]>(() => loadFromStorage('referralEvents', initReferralEvents));
  const [consultations, setConsultations] = useState<Consultation[]>(() => loadFromStorage('consultations', initConsultations));
  const [vitalsList, setVitalsList] = useState<Vitals[]>(() => loadFromStorage('vitals', initVitals));
  const [healthRecordsList, setHealthRecordsList] = useState<HealthRecord[]>(() => loadFromStorage('healthRecords', initHealthRecords));
  const [medicineStockList, setMedicineStockList] = useState<MedicineStock[]>(() => loadFromStorage('medicineStock', initMedicineStock));
  const [diagnosticsList, setDiagnosticsList] = useState<Diagnostic[]>(() => loadFromStorage('diagnostics', initDiagnostics));
  const [villageScoresList, setVillageScoresList] = useState<VillageAccessScore[]>(() => loadFromStorage('villageAccessScores', initVillageScores));
  const [predictionsList, setPredictionsList] = useState<ReferralPrediction[]>(() => loadFromStorage('referralPredictions', initPredictions));

  const now = () => new Date().toISOString();

  const addReferralEvent = useCallback((referralId: string, status: ReferralStatus, description: string, performedBy: string) => {
    const event: ReferralEvent = {
      id: `re-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      referralId, status, description, performedBy, timestamp: now()
    };
    setReferralEvents(prev => [...prev, event]);
  }, []);

  // ── Computed Analytics ─────────────────────────────────────────

  const computedAnalytics = useMemo<DistrictAnalytics>(() => {
    const totalReferrals = referrals.length;
    const closedReferrals = referrals.filter(r => r.status === 'closed').length;
    const closureRate = totalReferrals > 0 ? Math.round((closedReferrals / totalReferrals) * 100) : 0;

    const missedFollowups = followups.filter(f => f.status === 'missed').length;
    const overdueFollowups = followups.filter(f => f.status === 'overdue').length;

    const highRiskPending = referrals.filter(r =>
      r.priority === 'emergency' && r.status !== 'closed'
    ).length;

    const lowStockMedicines = medicineStockList.filter(m => m.status === 'low_stock').length;
    const outOfStockMedicines = medicineStockList.filter(m => m.status === 'out_of_stock').length;
    const totalMedicines = medicineStockList.filter(m => m.status !== 'out_of_stock').length;
    const availableDiagnostics = diagnosticsList.filter((d: Diagnostic) => d.available).length;

    const totalBeds = initFacilities.reduce((sum: number, f: Facility) => sum + f.totalBeds, 0);
    const occupiedBeds = initFacilities.reduce((sum: number, f: Facility) => sum + f.occupiedBeds, 0);
    const specialistsOnDuty = initFacilities.reduce((sum: number, f: Facility) => sum + f.specialistsAvailable, 0);

    const avgWaitTime = initFacilities.length > 0
      ? Math.round(initFacilities.reduce((sum: number, f: Facility) => sum + f.averageWaitTime, 0) / initFacilities.length)
      : 0;

    const avgVillageScore = villageScoresList.length > 0
      ? Math.round(villageScoresList.reduce((sum: number, v: VillageAccessScore) => sum + v.overallScore, 0) / villageScoresList.length)
      : 0;

    return {
      totalPatients: patients.length,
      totalReferrals,
      referralClosureRate: closureRate,
      averageWaitingTime: avgWaitTime / 60, // convert minutes to hours for display
      missedFollowups: missedFollowups + overdueFollowups,
      highRiskPending,
      facilitiesOperational: initFacilities.length,
      totalBeds,
      occupiedBeds,
      specialistsOnDuty,
      diagnosticsAvailable: availableDiagnostics,
      medicinesInStock: totalMedicines,
      lowStockMedicines: lowStockMedicines + outOfStockMedicines,
      ruralAccessScore: avgVillageScore,
    };
  }, [referrals, followups, patients, medicineStockList, diagnosticsList, villageScoresList]);

  const computedReferralFunnel = useMemo<ReferralFunnelStage[]>(() => {
    const total = referrals.length || 1;
    const byStatus = (status: ReferralStatus) =>
      referrals.filter(r => {
        const rStep = REFERRAL_STEP_MAP[r.status];
        const targetStep = REFERRAL_STEP_MAP[status];
        return rStep >= targetStep;
      }).length;

    const stages = [
      { stage: 'Created', status: 'created' as ReferralStatus },
      { stage: 'Accepted', status: 'accepted' as ReferralStatus },
      { stage: 'Scheduled', status: 'scheduled' as ReferralStatus },
      { stage: 'Patient Arrived', status: 'patient_arrived' as ReferralStatus },
      { stage: 'Consultation', status: 'consultation' as ReferralStatus },
      { stage: 'Treatment', status: 'treatment' as ReferralStatus },
      { stage: 'Follow-up', status: 'followup' as ReferralStatus },
      { stage: 'Closed', status: 'closed' as ReferralStatus },
    ];

    return stages.map(s => {
      const count = byStatus(s.status);
      return {
        stage: s.stage,
        count,
        percentage: Math.round((count / total) * 100),
      };
    });
  }, [referrals]);

  // ── Referral actions ──────────────────────────────────────────
  const acceptReferral = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => {
      if (r.id !== referralId) return r;
      if (r.status !== 'created') return r; // prevent invalid transition
      return { ...r, status: 'accepted' as ReferralStatus, currentStep: 2, updatedAt: now() };
    }));
    const ref = referrals.find(r => r.id === referralId);
    if (ref) addReferralEvent(referralId, 'accepted', `Referral accepted by ${ref.destinationFacilityName}`, 'Hospital Admin');
  }, [referrals, addReferralEvent]);

  const rejectReferral = useCallback((referralId: string) => {
    const ref = referrals.find(r => r.id === referralId);
    if (ref && ref.status === 'created') {
      addReferralEvent(referralId, 'created', 'Referral rejected by hospital', 'Hospital Admin');
    }
  }, [referrals, addReferralEvent]);

  const scheduleReferral = useCallback((referralId: string, date: string, time: string) => {
    setReferrals(prev => prev.map(r => {
      if (r.id !== referralId) return r;
      if (r.status !== 'accepted') return r;
      return { ...r, status: 'scheduled' as ReferralStatus, currentStep: 3, appointmentDate: date, appointmentTime: time, updatedAt: now() };
    }));
    addReferralEvent(referralId, 'scheduled', `Appointment scheduled for ${date} at ${time}`, 'Hospital Admin');
  }, [addReferralEvent]);

  const confirmArrival = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => {
      if (r.id !== referralId) return r;
      if (r.status !== 'scheduled') return r;
      return { ...r, status: 'patient_arrived' as ReferralStatus, currentStep: 4, updatedAt: now() };
    }));
    addReferralEvent(referralId, 'patient_arrived', 'Patient arrived at hospital. QR code scanned at reception.', 'Reception Desk');
  }, [addReferralEvent]);

  const startConsultation = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => {
      if (r.id !== referralId) return r;
      if (r.status !== 'patient_arrived') return r;
      return { ...r, status: 'consultation' as ReferralStatus, currentStep: 5, updatedAt: now() };
    }));
    addReferralEvent(referralId, 'consultation', 'Consultation started', 'Doctor');
  }, [addReferralEvent]);

  const completeConsultation = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => {
      if (r.id !== referralId) return r;
      if (r.status !== 'consultation') return r;
      return { ...r, status: 'treatment' as ReferralStatus, currentStep: 6, updatedAt: now() };
    }));
    addReferralEvent(referralId, 'treatment', 'Consultation completed. Treatment initiated.', 'Doctor');
  }, [addReferralEvent]);

  const addTreatment = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, updatedAt: now() } : r));
    addReferralEvent(referralId, 'treatment', 'Treatment plan documented and medication prescribed.', 'Doctor');
  }, [addReferralEvent]);

  const scheduleFollowup = useCallback((referralId: string, date: string, time: string) => {
    setReferrals(prev => prev.map(r => {
      if (r.id !== referralId) return r;
      if (r.status !== 'treatment') return r;
      return { ...r, status: 'followup' as ReferralStatus, currentStep: 7, updatedAt: now() };
    }));
    addReferralEvent(referralId, 'followup', `Follow-up scheduled for ${date} at ${time}`, 'Doctor');
    // Also create a Followup record so it appears in the follow-ups tab
    const ref = referrals.find(r => r.id === referralId);
    if (ref) {
      const fu: Followup = {
        id: `fu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        referralId: ref.id,
        patientId: ref.patientId,
        patientName: ref.patientName,
        doctorId: ref.doctorId || '',
        doctorName: ref.doctorName || 'Doctor',
        facilityName: ref.destinationFacilityName,
        scheduledDate: date,
        scheduledTime: time,
        status: 'scheduled',
        reason: ref.reason || 'Follow-up consultation',
        createdAt: now().split('T')[0],
      };
      setFollowups(prev => [...prev, fu]);
    }
  }, [referrals, addReferralEvent]);

  const completeFollowup = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => {
      if (r.id !== referralId) return r;
      if (r.status !== 'followup') return r;
      return { ...r, status: 'closed' as ReferralStatus, currentStep: 8, closedAt: now(), updatedAt: now() };
    }));
    // Mark all followups for this referral as completed
    setFollowups(prev => prev.map(f => f.referralId === referralId ? { ...f, status: 'completed' as FollowupStatus } : f));
    addReferralEvent(referralId, 'closed', 'Follow-up completed. Referral closed.', 'System');
  }, [addReferralEvent]);

  const createFollowup = useCallback((data: Omit<Followup, 'id' | 'createdAt'>) => {
    const fu: Followup = {
      ...data,
      id: `fu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now().split('T')[0],
    };
    setFollowups(prev => [...prev, fu]);
  }, []);

  const completeFollowupById = useCallback((followupId: string) => {
    setFollowups(prev => prev.map(f => f.id === followupId ? { ...f, status: 'completed' as FollowupStatus } : f));
  }, []);

  const markFollowupMissed = useCallback((followupId: string) => {
    setFollowups(prev => prev.map(f => f.id === followupId ? { ...f, status: 'missed' as FollowupStatus } : f));
  }, []);

  const closeReferral = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => {
      if (r.id !== referralId) return r;
      return { ...r, status: 'closed' as ReferralStatus, currentStep: 8, closedAt: now(), updatedAt: now() };
    }));
    addReferralEvent(referralId, 'closed', 'Referral closed.', 'System');
  }, [addReferralEvent]);

  const createReferral = useCallback((data: Omit<Referral, 'id' | 'referralId' | 'status' | 'currentStep' | 'totalSteps' | 'createdAt' | 'updatedAt' | 'isOverdue'>) => {
    const num = nextReferralNum++;
    const newRef: Referral = {
      ...data,
      id: `r${num}`,
      referralId: `REF-2026-${String(num).padStart(3, '0')}`,
      status: 'created',
      currentStep: 1,
      totalSteps: 8,
      createdAt: now(),
      updatedAt: now(),
      isOverdue: false,
    };
    setReferrals(prev => [...prev, newRef]);
    addReferralEvent(newRef.id, 'created', `Referral created. Priority: ${data.priority}. Destination: ${data.destinationFacilityName}`, data.doctorName || 'System');
    return newRef;
  }, [addReferralEvent]);

  // ── Appointment actions ───────────────────────────────────────
  const bookAppointment = useCallback((data: Omit<Appointment, 'id' | 'createdAt'>) => {
    const apt: Appointment = { ...data, id: `a${Date.now()}`, createdAt: now() };
    setAppointments(prev => [...prev, apt]);
  }, []);

  const cancelAppointment = useCallback((appointmentId: string) => {
    setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status: 'cancelled' as AppointmentStatus } : a));
  }, []);

  const completeAppointment = useCallback((appointmentId: string) => {
    setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status: 'completed' as AppointmentStatus } : a));
  }, []);

  // ── Patient actions ───────────────────────────────────────────
  const addPatient = useCallback((data: Omit<Patient, 'id' | 'userId' | 'createdAt' | 'healthCardId' | 'registeredAt'>) => {
    const id = `p${nextPatientId++}`;
    const healthCardId = `AL-PT-2026-${String(nextPatientId).padStart(3, '0')}`;
    const patient: Patient = {
      ...data, id, userId: `u${nextPatientId}`, healthCardId,
      registeredAt: now().split('T')[0], createdAt: now().split('T')[0]
    };
    setPatients(prev => [...prev, patient]);
    return patient;
  }, []);

  const addDoctor = useCallback((data: Omit<Doctor, 'id'>) => {
    const num = nextDoctorNum++;
    const id = `d${num}`;
    const doctorId = generateDoctorId(num);
    const doctor: Doctor = { ...data, id };
    setDoctorsList(prev => [...prev, doctor]);
    const username = (data as Record<string, unknown>).username as string || `doc.pdk${String(num).padStart(3, '0')}`;
    const tempPassword = (data as Record<string, unknown>).tempPassword as string || generateTempPassword();
    return {
      doctor,
      credentials: { doctorId, username, tempPassword },
    };
  }, []);

  const addHealthWorker = useCallback((data: Omit<HealthWorker, 'id'>) => {
    const num = nextHWNum++;
    const id = `hw${num}`;
    const hwId = generateHWId(num);
    const hw: HealthWorker = { ...data, id };
    setHealthWorkersList(prev => [...prev, hw]);
    const username = (data as Record<string, unknown>).username as string || `hw.pdk${String(num).padStart(3, '0')}`;
    const tempPassword = (data as Record<string, unknown>).tempPassword as string || generateTempPassword();
    return {
      hw,
      credentials: { hwId, username, tempPassword },
    };
  }, []);

  const addVitals = useCallback((data: Omit<Vitals, 'id'>) => {
    setVitalsList(prev => [...prev, { ...data, id: `v${Date.now()}` }]);
  }, []);

  const addHealthRecord = useCallback((data: Omit<HealthRecord, 'id'>) => {
    setHealthRecordsList(prev => [...prev, { ...data, id: `hr${Date.now()}` }]);
  }, []);

  const addConsultation = useCallback((data: Omit<Consultation, 'id'>) => {
    setConsultations(prev => [...prev, { ...data, id: `c${Date.now()}` }]);
  }, []);

  // ── Notification actions ──────────────────────────────────────
  const addNotification = useCallback((data: Omit<Notification, 'id' | 'createdAt'>) => {
    const n: Notification = { ...data, id: `n${nextNotifId++}`, createdAt: now() };
    setNotifications(prev => [...prev, n]);
  }, []);

  const markNotificationRead = useCallback((notifId: string) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
  }, []);

  const markAllNotificationsRead = useCallback((userId: string) => {
    setNotifications(prev => prev.map(n => n.userId === userId ? { ...n, read: true } : n));
  }, []);

  const getNotificationsForUser = useCallback((userId: string) => {
    return notifications.filter(n => n.userId === userId);
  }, [notifications]);

  // ── Medicine stock ────────────────────────────────────────────
  const updateMedicineStock = useCallback((stockId: string, quantity: number) => {
    setMedicineStockList(prev => prev.map(ms => ms.id === stockId ? {
      ...ms, quantity,
      status: quantity === 0 ? 'out_of_stock' as const : quantity < 50 ? 'low_stock' as const : 'in_stock' as const
    } : ms));
  }, []);

  const addMedicineStock = useCallback((data: Omit<MedicineStock, 'id'>) => {
    const med: MedicineStock = { ...data, id: `ms${Date.now()}-${Math.random().toString(36).slice(2, 5)}` };
    setMedicineStockList(prev => [...prev, med]);
  }, []);

  const removeMedicineStock = useCallback((stockId: string) => {
    setMedicineStockList(prev => prev.filter(ms => ms.id !== stockId));
  }, []);

  // ── Staff management ─────────────────────────────────────────
  const [staffUsersList, setStaffUsersList] = useState<User[]>(() => loadFromStorage('staffUsers', initStaffUsers));

  const addStaffUser = useCallback((data: Omit<User, 'id' | 'createdAt'>) => {
    const id = `ustaff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const user: User = { ...data, id, createdAt: now().split('T')[0] };
    setStaffUsersList(prev => [...prev, user]);
    return user;
  }, []);

  const updateStaffUser = useCallback((userId: string, data: Partial<User>) => {
    setStaffUsersList(prev => prev.map(u => u.id === userId ? { ...u, ...data } : u));
  }, []);

  const disableStaffUser = useCallback((userId: string) => {
    setStaffUsersList(prev => prev.map(u => u.id === userId ? { ...u, status: 'disabled' as const } : u));
  }, []);

  const enableStaffUser = useCallback((userId: string) => {
    setStaffUsersList(prev => prev.map(u => u.id === userId ? { ...u, status: 'active' as const } : u));
  }, []);

  const removeStaffUser = useCallback((userId: string) => {
    setStaffUsersList(prev => prev.filter(u => u.id !== userId));
  }, []);

  const getStaffByFacility = useCallback((facilityId: string) => staffUsersList.filter(u => u.facilityId === facilityId), [staffUsersList]);
  const getStaffByRole = useCallback((role: Role) => staffUsersList.filter(u => u.role === role), [staffUsersList]);

  // ── Hospital management ────────────────────────────────────────
  const [hospitalsList, setHospitalsList] = useState<Hospital[]>(() => {
    const loaded = loadFromStorage('hospitals', initHospitals);
    // Initialize counter from existing data to avoid ID collisions
    nextHospitalNum = loaded.length > 0
      ? Math.max(...loaded.map(h => {
          const match = h.id.match(/^h(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })) + 1
      : 1;
    return loaded;
  });

  const addHospital = useCallback((data: Omit<Hospital, 'id' | 'hospitalId' | 'createdAt'>) => {
    const num = nextHospitalNum++;
    const hospital: Hospital = {
      ...data,
      id: `h${num}`,
      hospitalId: generateHospitalId(num),
      createdAt: now().split('T')[0],
    };
    setHospitalsList(prev => [...prev, hospital]);

    // Auto-generate admin credentials
    const haNum = nextHANum++;
    const adminUserId = `ustaff-ha-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const username = data.adminUsername || `hosadmin.pdk${String(haNum).padStart(3, '0')}`;
    const tempPassword = data.adminTempPassword || generateTempPassword();

    const adminUser: User = {
      id: adminUserId,
      name: data.adminName || '',
      email: data.adminEmail || '',
      role: 'hospital_admin',
      username,
      password: tempPassword,
      phone: data.adminPhone || '',
      facilityId: hospital.id,
      status: 'active',
      createdBy: data.createdByUserId,
      createdAt: now().split('T')[0],
      mustChangePassword: true,
    };
    setStaffUsersList(prev => [...prev, adminUser]);

    // Update hospital with admin user ID and credential display fields
    setHospitalsList(prev => prev.map(h => h.id === hospital.id ? {
      ...h,
      adminUserId,
      adminName: data.adminName,
      adminUsername: username,
      adminEmail: data.adminEmail,
      adminPhone: data.adminPhone,
      adminTempPassword: tempPassword,
    } : h));

    return {
      hospital: { ...hospital, adminUserId, adminName: data.adminName, adminUsername: username, adminTempPassword: tempPassword },
      adminCredentials: { adminUserId, adminId: generateAdminId(haNum), username, tempPassword },
    };
  }, []);

  const updateHospital = useCallback((hospitalId: string, data: Partial<Hospital>) => {
    setHospitalsList(prev => prev.map(h => h.id === hospitalId ? { ...h, ...data } : h));
  }, []);

  const toggleHospitalStatus = useCallback((hospitalId: string) => {
    setHospitalsList(prev => prev.map(h => h.id === hospitalId ? {
      ...h,
      status: h.status === 'active' ? 'inactive' as const : 'active' as const
    } : h));
  }, []);

  const removeHospital = useCallback((hospitalId: string) => {
    // Disable the associated admin user account
    const hospital = hospitalsList.find(h => h.id === hospitalId);
    if (hospital?.adminUserId) {
      setStaffUsersList(prev => prev.map(u => u.id === hospital.adminUserId ? { ...u, status: 'disabled' as const } : u));
    }
    // Remove the hospital
    setHospitalsList(prev => prev.filter(h => h.id !== hospitalId));
  }, [hospitalsList]);

  // ── Cross-device sync via Convex ────────────────────────────────
  // The cloud is the source of truth; localStorage is the offline cache.
  // Every device subscribes to the same rows, so a hospital created by the
  // District Admin on one device appears on all other devices automatically.
  const cloudRaw = useQuery(api.appData.getAll);
  const saveCollection = useMutation(api.appData.saveCollection);
  const cloudReady = cloudRaw !== undefined;

  // One registry entry per shared collection. `get` reads current state,
  // `set` adopts cloud data (typed cast per collection).
  const collectionRegistry: Array<{
    key: CloudCollectionKey;
    get: () => unknown[];
    set: (items: unknown[]) => void;
  }> = [
    { key: 'patients', get: () => patients, set: (xs) => setPatients(xs as Patient[]) },
    { key: 'doctors', get: () => doctorsList, set: (xs) => setDoctorsList(xs as Doctor[]) },
    { key: 'healthWorkers', get: () => healthWorkersList, set: (xs) => setHealthWorkersList(xs as HealthWorker[]) },
    { key: 'staffUsers', get: () => staffUsersList, set: (xs) => setStaffUsersList(xs as User[]) },
    { key: 'hospitals', get: () => hospitalsList, set: (xs) => setHospitalsList(xs as Hospital[]) },
    { key: 'referrals', get: () => referrals, set: (xs) => setReferrals(xs as Referral[]) },
    { key: 'appointments', get: () => appointments, set: (xs) => setAppointments(xs as Appointment[]) },
    { key: 'followups', get: () => followups, set: (xs) => setFollowups(xs as Followup[]) },
    { key: 'notifications', get: () => notifications, set: (xs) => setNotifications(xs as Notification[]) },
    { key: 'referralEvents', get: () => referralEvents, set: (xs) => setReferralEvents(xs as ReferralEvent[]) },
    { key: 'consultations', get: () => consultations, set: (xs) => setConsultations(xs as Consultation[]) },
    { key: 'vitals', get: () => vitalsList, set: (xs) => setVitalsList(xs as Vitals[]) },
    { key: 'healthRecords', get: () => healthRecordsList, set: (xs) => setHealthRecordsList(xs as HealthRecord[]) },
    { key: 'medicineStock', get: () => medicineStockList, set: (xs) => setMedicineStockList(xs as MedicineStock[]) },
    { key: 'diagnostics', get: () => diagnosticsList, set: (xs) => setDiagnosticsList(xs as Diagnostic[]) },
    { key: 'villageAccessScores', get: () => villageScoresList, set: (xs) => setVillageScoresList(xs as VillageAccessScore[]) },
    { key: 'referralPredictions', get: () => predictionsList, set: (xs) => setPredictionsList(xs as ReferralPrediction[]) },
  ];

  const lastWrittenRef = useRef<Record<string, string>>({});
  const didSyncRef = useRef(false);

  // 1) Adopt cloud data whenever it changes (including other devices' writes)
  useEffect(() => {
    if (!cloudReady) return;
    const raw = cloudRaw as Record<string, unknown>;
    const adopted: Record<string, unknown[]> = {};
    for (const { key, set } of collectionRegistry) {
      const items = unwrapFromCloud(raw[key]);
      if (items) {
        lastWrittenRef.current[key] = wrapForCloud(items);
        adopted[key] = items;
        set(items);
      }
    }
    // Keep ID counters ahead of the adopted data to avoid collisions
    // with records created on other devices (IDs like h7, d12, hw6, r14, p12).
    const maxNum = (items: unknown[], re: RegExp): number => items.reduce<number>((acc, it) => {
      const m = (it as { id?: string }).id?.match(re);
      return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
    }, 0);
    if (adopted.hospitals) {
      const n = maxNum(adopted.hospitals, /^h(\d+)$/);
      nextHospitalNum = Math.max(nextHospitalNum, n + 1);
      nextHANum = Math.max(nextHANum, n + 1);
    }
    if (adopted.doctors) {
      nextDoctorNum = Math.max(nextDoctorNum, maxNum(adopted.doctors, /^d(\d+)$/) + 1);
    }
    if (adopted.healthWorkers) {
      nextHWNum = Math.max(nextHWNum, maxNum(adopted.healthWorkers, /^hw(\d+)$/) + 1);
    }
    if (adopted.referrals) {
      nextReferralNum = Math.max(nextReferralNum, maxNum(adopted.referrals, /^r(\d+)$/) + 1);
    }
    if (adopted.patients) {
      nextPatientId = Math.max(nextPatientId, maxNum(adopted.patients, /^p(\d+)$/) + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady, cloudRaw]);

  // 2) Seed the cloud with seed data when it has nothing for the current version
  useEffect(() => {
    if (!cloudReady || didSyncRef.current) return;
    const raw = cloudRaw as Record<string, unknown>;
    const hasValidData = collectionRegistry.some(({ key }) => unwrapFromCloud(raw[key]) !== null);
    if (!hasValidData) {
      didSyncRef.current = true;
      for (const { key, get } of collectionRegistry) {
        const payload = wrapForCloud(get());
        lastWrittenRef.current[key] = payload;
        void saveCollection({ key, data: payload });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady, cloudRaw, saveCollection]);

  // 3) Push local changes to the cloud (debounced, skip unchanged)
  const cloudTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cloudSyncedRef = useRef(false);
  useEffect(() => {
    if (!cloudReady) {
      cloudSyncedRef.current = false;
      return;
    }
    // Skip the first fire after hydration: adopt/seed already aligned state
    if (!cloudSyncedRef.current) {
      cloudSyncedRef.current = true;
      return;
    }
    for (const { key, get } of collectionRegistry) {
      const payload = wrapForCloud(get());
      // Always cancel any pending write first — a render triggered by cloud
      // adoption can otherwise leave a stale debounced write that would
      // overwrite newer cloud data with pre-adoption local state.
      clearTimeout(cloudTimersRef.current[key]);
      if (lastWrittenRef.current[key] === payload) continue;
      lastWrittenRef.current[key] = payload;
      cloudTimersRef.current[key] = setTimeout(() => {
        void saveCollection({ key, data: payload });
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, doctorsList, healthWorkersList, staffUsersList, hospitalsList,
     referrals, appointments, followups, notifications, referralEvents,
     consultations, vitalsList, healthRecordsList, medicineStockList,
     diagnosticsList, villageScoresList, predictionsList,
     cloudReady, saveCollection]);

  // ── Persist changes to localStorage (offline cache) ─────────────
  useEffect(() => { saveToStorage('patients', patients); }, [patients]);
  useEffect(() => { saveToStorage('doctors', doctorsList); }, [doctorsList]);
  useEffect(() => { saveToStorage('healthWorkers', healthWorkersList); }, [healthWorkersList]);
  useEffect(() => { saveToStorage('staffUsers', staffUsersList); }, [staffUsersList]);
  useEffect(() => { saveToStorage('hospitals', hospitalsList); }, [hospitalsList]);
  useEffect(() => { saveToStorage('referrals', referrals); }, [referrals]);
  useEffect(() => { saveToStorage('appointments', appointments); }, [appointments]);
  useEffect(() => { saveToStorage('followups', followups); }, [followups]);
  useEffect(() => { saveToStorage('notifications', notifications); }, [notifications]);
  useEffect(() => { saveToStorage('referralEvents', referralEvents); }, [referralEvents]);
  useEffect(() => { saveToStorage('consultations', consultations); }, [consultations]);
  useEffect(() => { saveToStorage('vitals', vitalsList); }, [vitalsList]);
  useEffect(() => { saveToStorage('healthRecords', healthRecordsList); }, [healthRecordsList]);
  useEffect(() => { saveToStorage('medicineStock', medicineStockList); }, [medicineStockList]);
  useEffect(() => { saveToStorage('diagnostics', diagnosticsList); }, [diagnosticsList]);
  useEffect(() => { saveToStorage('villageAccessScores', villageScoresList); }, [villageScoresList]);
  useEffect(() => { saveToStorage('referralPredictions', predictionsList); }, [predictionsList]);

  // ── Helpers ───────────────────────────────────────────────────
  const getPatientById = useCallback((id: string) => patients.find(p => p.id === id), [patients]);
  const getPatientByEmail = useCallback((email: string) => patients.find(p => p.registeredByEmail === email), [patients]);
  const getPatientByHealthCardId = useCallback((healthCardId: string) => patients.find(p => p.healthCardId === healthCardId), [patients]);
  const getDoctorById = useCallback((id: string) => doctorsList.find((d: Doctor) => d.id === id), [doctorsList]);
  const getFacilityById = useCallback((id: string) => initFacilities.find((f: Facility) => f.id === id), []);
  const getReferralsForPatient = useCallback((patientId: string) => referrals.filter(r => r.patientId === patientId), [referrals]);
  const getReferralsForFacility = useCallback((facilityId: string) => referrals.filter(r => r.destinationFacilityId === facilityId), [referrals]);
  const getAppointmentsForDoctor = useCallback((doctorId: string) => appointments.filter(a => a.doctorId === doctorId), [appointments]);
  const getAppointmentsForPatient = useCallback((patientId: string) => appointments.filter(a => a.patientId === patientId), [appointments]);
  const getFollowupsForPatient = useCallback((patientId: string) => followups.filter(f => f.patientId === patientId), [followups]);
  const getFollowupsForDoctor = useCallback((doctorId: string) => followups.filter(f => f.doctorId === doctorId), [followups]);
  const getReferralEvents = useCallback((referralId: string) => referralEvents.filter(e => e.referralId === referralId).sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [referralEvents]);
  const getVitalsForPatient = useCallback((patientId: string) => vitalsList.filter(v => v.patientId === patientId), [vitalsList]);
  const getHealthRecordsForPatient = useCallback((patientId: string) => healthRecordsList.filter(r => r.patientId === patientId), [healthRecordsList]);
  const getConsultationsForPatient = useCallback((patientId: string) => consultations.filter(c => c.patientId === patientId), [consultations]);
  const getPredictionForReferral = useCallback((referralId: string) => predictionsList.find(p => p.referralId === referralId), [predictionsList]);

  const value: DataContextValue = {
    patients, doctors: doctorsList, facilities: initFacilities, referrals, appointments, followups,
    healthWorkers: healthWorkersList, vitals: vitalsList, healthRecords: healthRecordsList,
    medicineStock: medicineStockList, diagnostics: diagnosticsList,
    villageAccessScores: villageScoresList, notifications, referralEvents, consultations,
    referralPredictions: predictionsList, aiInsights: initInsights,
    districtAnalytics: computedAnalytics,
    referralFunnel: computedReferralFunnel,
    acceptReferral, rejectReferral, scheduleReferral, confirmArrival, startConsultation,
    completeConsultation, addTreatment, scheduleFollowup, createFollowup, completeFollowup, closeReferral, createReferral,
    bookAppointment, cancelAppointment, completeAppointment,
    addPatient, addDoctor, addHealthWorker, addVitals, addHealthRecord, addConsultation,
    completeFollowupById, markFollowupMissed,
    addNotification, markNotificationRead, markAllNotificationsRead, getNotificationsForUser,
    updateMedicineStock, addMedicineStock, removeMedicineStock,
    staffUsers: staffUsersList, addStaffUser, updateStaffUser, disableStaffUser, enableStaffUser, removeStaffUser, getStaffByFacility, getStaffByRole,
    hospitals: hospitalsList, addHospital, updateHospital, toggleHospitalStatus, removeHospital,
    getPatientById, getPatientByEmail, getPatientByHealthCardId, getDoctorById, getFacilityById,
    getReferralsForPatient, getReferralsForFacility,
    getAppointmentsForDoctor, getAppointmentsForPatient,
    getFollowupsForPatient, getFollowupsForDoctor,
    getReferralEvents, getVitalsForPatient, getHealthRecordsForPatient,
    getConsultationsForPatient, getPredictionForReferral,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within a DataProvider');
  return context;
}
