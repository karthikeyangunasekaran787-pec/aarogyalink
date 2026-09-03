// ============================================================================
// AarogyaLink - Centralized Data Store
// All dashboards read/write from this single source of truth.
// Analytics are computed dynamically from actual data.
// ============================================================================

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
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
  completeFollowup: (referralId: string) => void;
  closeReferral: (referralId: string) => void;
  createReferral: (data: Omit<Referral, 'id' | 'referralId' | 'status' | 'currentStep' | 'totalSteps' | 'createdAt' | 'updatedAt' | 'isOverdue'>) => void;

  // Appointment actions
  bookAppointment: (data: Omit<Appointment, 'id' | 'createdAt'>) => void;
  cancelAppointment: (appointmentId: string) => void;

  // Patient actions
  addPatient: (data: Omit<Patient, 'id' | 'userId' | 'createdAt' | 'healthCardId' | 'registeredAt'>) => Patient;
  addVitals: (data: Omit<Vitals, 'id'>) => void;
  addHealthRecord: (data: Omit<HealthRecord, 'id'>) => void;
  addConsultation: (data: Omit<Consultation, 'id'>) => void;

  // Followup actions
  completeFollowupById: (followupId: string) => void;
  markFollowupMissed: (followupId: string) => void;

  // Notification actions
  addNotification: (data: Omit<Notification, 'id' | 'createdAt'>) => void;
  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: (userId: string) => void;
  getNotificationsForUser: (userId: string) => Notification[];

  // Medicine stock
  updateMedicineStock: (stockId: string, quantity: number) => void;

  // Staff management
  addStaffUser: (data: Omit<User, 'id' | 'createdAt'>) => User;
  updateStaffUser: (userId: string, data: Partial<User>) => void;
  disableStaffUser: (userId: string) => void;
  enableStaffUser: (userId: string) => void;
  removeStaffUser: (userId: string) => void;
  getStaffByFacility: (facilityId: string) => User[];
  getStaffByRole: (role: Role) => User[];

  // Hospital management (District Admin)
  addHospital: (data: Omit<Hospital, 'id' | 'hospitalId' | 'createdAt'>) => Hospital;
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

export function DataProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>(() => loadFromStorage('patients', initPatients));
  const [referrals, setReferrals] = useState<Referral[]>(initReferrals);
  const [appointments, setAppointments] = useState<Appointment[]>(initAppointments);
  const [followups, setFollowups] = useState<Followup[]>(initFollowups);
  const [notifications, setNotifications] = useState<Notification[]>(initNotifications);
  const [referralEvents, setReferralEvents] = useState<ReferralEvent[]>(initReferralEvents);
  const [consultations, setConsultations] = useState<Consultation[]>(initConsultations);
  const [vitalsList, setVitalsList] = useState<Vitals[]>(initVitals);
  const [healthRecordsList, setHealthRecordsList] = useState<HealthRecord[]>(initHealthRecords);
  const [medicineStockList, setMedicineStockList] = useState<MedicineStock[]>(initMedicineStock);

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
    const availableDiagnostics = initDiagnostics.filter((d: Diagnostic) => d.available).length;

    const totalBeds = initFacilities.reduce((sum: number, f: Facility) => sum + f.totalBeds, 0);
    const occupiedBeds = initFacilities.reduce((sum: number, f: Facility) => sum + f.occupiedBeds, 0);
    const specialistsOnDuty = initFacilities.reduce((sum: number, f: Facility) => sum + f.specialistsAvailable, 0);

    const avgWaitTime = initFacilities.length > 0
      ? Math.round(initFacilities.reduce((sum: number, f: Facility) => sum + f.averageWaitTime, 0) / initFacilities.length)
      : 0;

    const avgVillageScore = initVillageScores.length > 0
      ? Math.round(initVillageScores.reduce((sum: number, v: VillageAccessScore) => sum + v.overallScore, 0) / initVillageScores.length)
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
  }, [referrals, followups, patients, medicineStockList]);

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
  }, [addReferralEvent]);

  const completeFollowup = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => {
      if (r.id !== referralId) return r;
      if (r.status !== 'followup') return r;
      return { ...r, status: 'closed' as ReferralStatus, currentStep: 8, closedAt: now(), updatedAt: now() };
    }));
    addReferralEvent(referralId, 'closed', 'Follow-up completed. Referral closed.', 'System');
  }, [addReferralEvent]);

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

  const addVitals = useCallback((data: Omit<Vitals, 'id'>) => {
    setVitalsList(prev => [...prev, { ...data, id: `v${Date.now()}` }]);
  }, []);

  const addHealthRecord = useCallback((data: Omit<HealthRecord, 'id'>) => {
    setHealthRecordsList(prev => [...prev, { ...data, id: `hr${Date.now()}` }]);
  }, []);

  const addConsultation = useCallback((data: Omit<Consultation, 'id'>) => {
    setConsultations(prev => [...prev, { ...data, id: `c${Date.now()}` }]);
  }, []);

  // ── Followup actions ──────────────────────────────────────────
  const completeFollowupById = useCallback((followupId: string) => {
    setFollowups(prev => prev.map(f => f.id === followupId ? { ...f, status: 'completed' as FollowupStatus } : f));
  }, []);

  const markFollowupMissed = useCallback((followupId: string) => {
    setFollowups(prev => prev.map(f => f.id === followupId ? { ...f, status: 'missed' as FollowupStatus } : f));
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
  const [hospitalsList, setHospitalsList] = useState<Hospital[]>(() => loadFromStorage('hospitals', initHospitals));

  const addHospital = useCallback((data: Omit<Hospital, 'id' | 'hospitalId' | 'createdAt'>) => {
    const num = hospitalsList.length + 1;
    const hospital: Hospital = {
      ...data,
      id: `h${num}`,
      hospitalId: `HOS-2026-${String(num).padStart(3, '0')}`,
      createdAt: now().split('T')[0],
    };
    setHospitalsList(prev => [...prev, hospital]);
    return hospital;
  }, [hospitalsList.length]);

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
      setStaffUsersList(prev => prev.map(u =>
        u.id === hospital.adminUserId ? { ...u, status: 'disabled' as const } : u
      ));
    }
    // Remove the hospital
    setHospitalsList(prev => prev.filter(h => h.id !== hospitalId));
  }, [hospitalsList]);

  // ── Persist changes to localStorage ────────────────────────────
  useEffect(() => { saveToStorage('patients', patients); }, [patients]);
  useEffect(() => { saveToStorage('staffUsers', staffUsersList); }, [staffUsersList]);
  useEffect(() => { saveToStorage('hospitals', hospitalsList); }, [hospitalsList]);

  // ── Helpers ───────────────────────────────────────────────────
  const getPatientById = useCallback((id: string) => patients.find(p => p.id === id), [patients]);
  const getPatientByEmail = useCallback((email: string) => patients.find(p => p.registeredByEmail === email), [patients]);
  const getPatientByHealthCardId = useCallback((healthCardId: string) => patients.find(p => p.healthCardId === healthCardId), [patients]);
  const getDoctorById = useCallback((id: string) => initDoctors.find((d: Doctor) => d.id === id), []);
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
  const getPredictionForReferral = useCallback((referralId: string) => initPredictions.find(p => p.referralId === referralId), []);

  const value: DataContextValue = {
    patients, doctors: initDoctors, facilities: initFacilities, referrals, appointments, followups,
    healthWorkers: initHealthWorkers, vitals: vitalsList, healthRecords: healthRecordsList,
    medicineStock: medicineStockList, diagnostics: initDiagnostics,
    villageAccessScores: initVillageScores, notifications, referralEvents, consultations,
    referralPredictions: initPredictions, aiInsights: initInsights,
    districtAnalytics: computedAnalytics,
    referralFunnel: computedReferralFunnel,
    acceptReferral, rejectReferral, scheduleReferral, confirmArrival, startConsultation,
    completeConsultation, addTreatment, scheduleFollowup, completeFollowup, closeReferral, createReferral,
    bookAppointment, cancelAppointment,
    addPatient, addVitals, addHealthRecord, addConsultation,
    completeFollowupById, markFollowupMissed,
    addNotification, markNotificationRead, markAllNotificationsRead, getNotificationsForUser,
    updateMedicineStock,
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
