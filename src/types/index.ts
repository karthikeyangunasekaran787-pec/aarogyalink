// ============================================================================
// AarogyaLink - Type Definitions
// ============================================================================

export type Role = 'patient' | 'health_worker' | 'doctor' | 'hospital_admin' | 'gov_admin';
export type Language = 'en' | 'ta' | 'hi';
export type RiskLevel = 'low' | 'medium' | 'high' | 'emergency';
export type ReferralStatus = 'created' | 'accepted' | 'scheduled' | 'patient_arrived' | 'consultation' | 'treatment' | 'followup' | 'closed';
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'missed';
export type FollowupStatus = 'scheduled' | 'completed' | 'missed' | 'overdue' | 'rescheduled';

export type StaffStatus = 'active' | 'disabled' | 'pending_password_change';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  username?: string;
  phone?: string;
  avatar?: string;
  language?: Language;
  facilityId?: string;
  departmentId?: string;
  status: StaffStatus;
  createdBy?: string; // user_id of who created this account
  createdAt: string;
  lastLogin?: string;
  mustChangePassword?: boolean;
}

export interface Patient {
  id: string;
  userId: string;
  healthCardId: string; // unique Health Card ID like "HC-2026-XXXX"
  registeredByEmail: string; // email used during registration
  registeredAt: string;
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  phone: string;
  address: string;
  village: string;
  district: string;
  state: string;
  bloodGroup?: string;
  aadhaarLast4?: string;
  emergencyContact?: string;
  allergies?: string[];
  chronicConditions?: string[];
  createdAt: string;
}

export interface HealthWorker {
  id: string;
  userId: string;
  name: string;
  phone: string;
  facilityId: string;
  area: string;
  patientsAssigned: number;
}

export interface Doctor {
  id: string;
  userId: string;
  name: string;
  specialization: string;
  facilityId: string;
  qualification: string;
  experience: number;
  phone: string;
  availableDays: string[];
  consultationFee: number;
  rating: number;
}

export interface Facility {
  id: string;
  name: string;
  type: 'phc' | 'chc' | 'dh' | 'medical_college' | 'private';
  address: string;
  village: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  phone: string;
  emergencyAvailable: boolean;
  departments: string[];
  totalBeds: number;
  occupiedBeds: number;
  specialistsAvailable: number;
  diagnosticsAvailable: string[];
  medicinesAvailable: string[];
  averageWaitTime: number; // minutes
  rating: number;
  careMatchScore?: number;
}

export interface Hospital {
  id: string;
  name: string;
  hospitalId: string; // unique human-readable ID like "HOS-2026-001"
  type: 'government' | 'private' | 'trust' | 'charitable';
  address: string;
  district: string;
  state: string;
  phone: string;
  email: string;
  departments: string[];
  services: string[];
  totalBeds: number;
  occupiedBeds: number;
  status: 'active' | 'inactive' | 'suspended';
  adminUserId: string; // the hospital_admin user who manages this hospital
  createdByUserId: string; // district admin who created it
  createdAt: string;
}

export interface Department {
  id: string;
  facilityId: string;
  name: string;
  headDoctorId?: string;
  totalSlots: number;
  occupiedSlots: number;
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  facilityId: string;
  department: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  reason: string;
  notes?: string;
  createdAt: string;
}

export interface Consultation {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  symptoms: string[];
  diagnosis: string;
  prescription: string[];
  notes: string;
  followupRequired: boolean;
  followupDate?: string;
  createdAt: string;
}

export interface Vitals {
  id: string;
  patientId: string;
  recordedBy: string;
  date: string;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  temperature?: number;
  spO2?: number;
  weight?: number;
  height?: number;
  bloodSugar?: number;
}

export interface HealthRecord {
  id: string;
  patientId: string;
  type: 'consultation' | 'lab_report' | 'prescription' | 'vaccination' | 'referral';
  title: string;
  description: string;
  facilityName: string;
  doctorName?: string;
  date: string;
  attachments?: string[];
}

export interface Referral {
  id: string;
  referralId: string; // unique human-readable ID like "REF-2026-001"
  patientId: string;
  patientName: string;
  sourceFacilityId: string;
  sourceFacilityName: string;
  destinationFacilityId: string;
  destinationFacilityName: string;
  department: string;
  doctorId?: string;
  doctorName?: string;
  priority: 'routine' | 'urgent' | 'emergency';
  reason: string;
  status: ReferralStatus;
  currentStep: number;
  totalSteps: number;
  appointmentDate?: string;
  appointmentTime?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  isOverdue: boolean;
  notes?: string;
  // Attribution fields — who performed each action
  createdByUserId?: string;
  createdByName?: string;
  createdByRole?: string;
  acceptedByUserId?: string;
  acceptedByName?: string;
  assignedDoctorId?: string;
  assignedDoctorName?: string;
}

export interface ReferralEvent {
  id: string;
  referralId: string;
  status: ReferralStatus;
  description: string;
  performedBy: string;
  timestamp: string;
}

export interface Followup {
  id: string;
  referralId: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  facilityName: string;
  scheduledDate: string;
  scheduledTime: string;
  status: FollowupStatus;
  reason: string;
  notes?: string;
  missedFollowupRisk?: number; // 0-100 percentage
  createdAt: string;
}

export interface Medicine {
  id: string;
  name: string;
  category: string;
  genericName: string;
  dosageForm: string;
  manufacturer: string;
}

export interface MedicineStock {
  id: string;
  medicineId: string;
  medicineName: string;
  facilityId: string;
  facilityName: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface Diagnostic {
  id: string;
  name: string;
  category: string;
  facilityId: string;
  facilityName: string;
  available: boolean;
  waitTime: number; // days
  cost: number;
}

export interface AIAssessment {
  id: string;
  patientId: string;
  type: 'symptom_triage' | 'referral_prediction' | 'access_score';
  input: Record<string, unknown>;
  output: {
    riskLevel: RiskLevel;
    confidence: number;
    reasoning: string[];
    recommendation: string;
    isClinicalDecisionSupport: boolean;
  };
  createdAt: string;
}

export interface ReferralPrediction {
  referralId: string;
  completionProbability: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors: string[];
  recommendedAction: string;
}

export interface VillageAccessScore {
  villageId: string;
  villageName: string;
  district: string;
  latitude: number;
  longitude: number;
  overallScore: number; // 0-100
  distanceToFacility: number; // km
  facilityCapacity: number; // 0-100
  specialistAvailability: number; // 0-100
  diagnosticAvailability: number; // 0-100
  medicineAvailability: number; // 0-100
  averageWaitTime: number; // minutes
  accessLevel: 'good' | 'moderate' | 'underserved';
  population: number;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert' | 'success';
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}

export interface Consent {
  id: string;
  patientId: string;
  type: 'data_sharing' | 'referral' | 'treatment' | 'research';
  granted: boolean;
  grantedTo?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface SyncStatus {
  lastSynced: string;
  pendingItems: number;
  isOnline: boolean;
}

export interface KPIData {
  label: string;
  value: string | number;
  change?: number;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: string;
}

export interface ReferralFunnelStage {
  stage: string;
  count: number;
  percentage: number;
}

export interface DistrictAnalytics {
  totalPatients: number;
  totalReferrals: number;
  referralClosureRate: number;
  averageWaitingTime: number;
  missedFollowups: number;
  highRiskPending: number;
  facilitiesOperational: number;
  totalBeds: number;
  occupiedBeds: number;
  specialistsOnDuty: number;
  diagnosticsAvailable: number;
  medicinesInStock: number;
  lowStockMedicines: number;
  ruralAccessScore: number;
}

export interface InsightCard {
  id: string;
  type: 'warning' | 'info' | 'recommendation' | 'alert';
  title: string;
  description: string;
  metric?: string;
  priority: 'low' | 'medium' | 'high';
}
