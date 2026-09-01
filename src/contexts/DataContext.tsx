// ============================================================================
// AarogyaLink - Centralized Data Store
// All dashboards read/write from this single source of truth.
// ============================================================================

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type {
  Patient, Doctor, Facility, Referral, Appointment, Followup,
  HealthWorker, Vitals, HealthRecord, MedicineStock, Diagnostic,
  VillageAccessScore, Notification, ReferralEvent, Consultation,
  ReferralPrediction, RiskLevel, ReferralStatus, AppointmentStatus, FollowupStatus
} from '@/types';

// Initial data
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
  districtAnalytics as initAnalytics,
  referralFunnel as initFunnel,
  aiInsights as initInsights,
  monthlyReferralTrends as initTrends,
  facilityPerformance as initFacilityPerf,
} from '@/lib/mock-data';

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
  referralEvents: ReferralEvent[];
  consultations: Consultation[];
  referralPredictions: ReferralPrediction[];
  districtAnalytics: typeof initAnalytics;
  referralFunnel: typeof initFunnel;
  aiInsights: typeof initInsights;
  monthlyReferralTrends: typeof initTrends;
  facilityPerformance: typeof initFacilityPerf;

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
  addPatient: (data: Omit<Patient, 'id' | 'userId' | 'createdAt'>) => Patient;
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

  // Helpers
  getPatientById: (id: string) => Patient | undefined;
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

export function DataProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>(initPatients);
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

  // ── Referral actions ──────────────────────────────────────────
  const acceptReferral = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, status: 'accepted' as ReferralStatus, currentStep: 2, updatedAt: now() } : r));
    const ref = referrals.find(r => r.id === referralId);
    if (ref) addReferralEvent(referralId, 'accepted', `Referral accepted by ${ref.destinationFacilityName}`, 'Hospital Admin');
  }, [referrals, addReferralEvent]);

  const rejectReferral = useCallback((referralId: string) => {
    addReferralEvent(referralId, 'created', 'Referral rejected by hospital', 'Hospital Admin');
  }, [addReferralEvent]);

  const scheduleReferral = useCallback((referralId: string, date: string, time: string) => {
    setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, status: 'scheduled' as ReferralStatus, currentStep: 3, appointmentDate: date, appointmentTime: time, updatedAt: now() } : r));
    addReferralEvent(referralId, 'scheduled', `Appointment scheduled for ${date} at ${time}`, 'Hospital Admin');
  }, [addReferralEvent]);

  const confirmArrival = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, status: 'patient_arrived' as ReferralStatus, currentStep: 4, updatedAt: now() } : r));
    addReferralEvent(referralId, 'patient_arrived', 'Patient arrived at hospital. QR code scanned at reception.', 'Reception Desk');
  }, [addReferralEvent]);

  const startConsultation = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, status: 'consultation' as ReferralStatus, currentStep: 5, updatedAt: now() } : r));
    addReferralEvent(referralId, 'consultation', 'Consultation started', 'Doctor');
  }, [addReferralEvent]);

  const completeConsultation = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, status: 'treatment' as ReferralStatus, currentStep: 6, updatedAt: now() } : r));
    addReferralEvent(referralId, 'treatment', 'Consultation completed. Treatment initiated.', 'Doctor');
  }, [addReferralEvent]);

  const addTreatment = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, updatedAt: now() } : r));
    addReferralEvent(referralId, 'treatment', 'Treatment plan documented and medication prescribed.', 'Doctor');
  }, [addReferralEvent]);

  const scheduleFollowup = useCallback((referralId: string, date: string, time: string) => {
    setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, status: 'followup' as ReferralStatus, currentStep: 7, updatedAt: now() } : r));
    addReferralEvent(referralId, 'followup', `Follow-up scheduled for ${date}`, 'Doctor');
  }, [addReferralEvent]);

  const completeFollowup = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, status: 'closed' as ReferralStatus, currentStep: 8, closedAt: now(), updatedAt: now() } : r));
    addReferralEvent(referralId, 'closed', 'Follow-up completed. Referral closed.', 'Doctor');
  }, [addReferralEvent]);

  const closeReferral = useCallback((referralId: string) => {
    setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, status: 'closed' as ReferralStatus, currentStep: 8, closedAt: now(), updatedAt: now() } : r));
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
  const addPatient = useCallback((data: Omit<Patient, 'id' | 'userId' | 'createdAt'>) => {
    const id = `p${nextPatientId++}`;
    const patient: Patient = { ...data, id, userId: `u${nextPatientId}`, createdAt: now().split('T')[0] };
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
    setMedicineStockList(prev => prev.map(ms => ms.id === stockId ? { ...ms, quantity, status: quantity === 0 ? 'out_of_stock' as const : quantity < 50 ? 'low_stock' as const : 'in_stock' as const } : ms));
  }, []);

  // ── Helpers ───────────────────────────────────────────────────
  const getPatientById = useCallback((id: string) => patients.find(p => p.id === id), [patients]);
  const getDoctorById = useCallback((id: string) => initDoctors.find(d => d.id === id), []);
  const getFacilityById = useCallback((id: string) => initFacilities.find(f => f.id === id), []);
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
    referralPredictions: initPredictions, districtAnalytics: initAnalytics,
    referralFunnel: initFunnel, aiInsights: initInsights,
    monthlyReferralTrends: initTrends, facilityPerformance: initFacilityPerf,
    acceptReferral, rejectReferral, scheduleReferral, confirmArrival, startConsultation,
    completeConsultation, addTreatment, scheduleFollowup, completeFollowup, closeReferral, createReferral,
    bookAppointment, cancelAppointment,
    addPatient, addVitals, addHealthRecord, addConsultation,
    addNotification, markNotificationRead, markAllNotificationsRead, getNotificationsForUser,
    updateMedicineStock,
    getPatientById, getDoctorById, getFacilityById,
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
