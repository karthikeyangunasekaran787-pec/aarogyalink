// ============================================================================
// Doctor Dashboard — Functional Consultation & Referral Management
// ============================================================================

import { useState } from 'react';
import type { Doctor } from '@/types';
import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { PriorityBadge } from '@/components/shared/RiskBadge';
import {
  Calendar, Users, FileText, Clock, Stethoscope, Activity,
  CheckCircle2, PlayCircle, PenLine, ChevronRight
} from 'lucide-react';

export default function DoctorDashboard() {
  const { language, currentUser } = useApp();
  const {
    doctors, patients, referrals, followups, facilities,
    getAppointmentsForDoctor, getReferralsForPatient, getVitalsForPatient,
    getConsultationsForPatient,
    startConsultation, completeConsultation, scheduleFollowup, closeReferral,
    addConsultation: addConsultationToData, createReferral, addNotification,
    completeAppointment, cancelAppointment, staffUsers
  } = useData();

  // Load doctors from context or localStorage as fallback
  const allDoctors = (() => {
    // First try context state
    if (doctors.length > 0) return doctors;
    // Then try localStorage
    try {
      const stored = localStorage.getItem('aal_doctors');
      if (stored) {
        const parsed = JSON.parse(stored) as Doctor[];
        if (parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [];
  })();

  // Find doctor record — primary: match by userId; fallback: match by name from staffUsers
  let doctor = allDoctors.find(d => d.userId === currentUser?.id);

  // Fallback: if no match by userId, try to find by matching the logged-in user's name
  if (!doctor && currentUser?.name) {
    const staffRecord = staffUsers.find(u => u.id === currentUser?.id);
    if (staffRecord) {
      doctor = allDoctors.find(d =>
        d.userId === staffRecord.id ||
        (d.name.toLowerCase() === staffRecord.name.toLowerCase() && d.facilityId === staffRecord.facilityId)
      );
    }
  }

  // Show a message if no doctor record found
  if (!doctor) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Stethoscope className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">No Doctor Profile Found</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Your account ({currentUser?.id || 'unknown'}) has no matching doctor profile.
            Doctor records found: {allDoctors.length}.
            Please contact your Hospital Administrator to create your doctor record via Staff Management.
          </p>
        </div>
      </div>
    );
  }

  const doctorFacility = facilities.find(f => f.id === doctor.facilityId);
  const doctorAppointments = getAppointmentsForDoctor(doctor.id);
  const todayAppointments = doctorAppointments.filter(a => a.status === 'scheduled');
  const completedAppointments = doctorAppointments.filter(a => a.status === 'completed');

  // Show referrals relevant to this doctor:
  // 1. Referrals where this doctor is the assigned specialist
  // 2. Referrals at the doctor's facility that are in actionable states
  // 3. Referrals assigned to this doctor's facility (any department)
  const activeReferrals = referrals.filter(r =>
    r.status !== 'closed' && r.status !== 'created' && (
      r.doctorId === doctor.id ||
      r.destinationFacilityId === doctor.facilityId
    )
  );
  const doctorFollowups = followups.filter(f => f.doctorId === doctor.id);

  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [consultationNotes, setConsultationNotes] = useState('');
  const [prescription, setPrescription] = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [consultingReferral, setConsultingReferral] = useState<string | null>(null);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');

  // Patient search by Health Card ID or name
  const searchResults = patientSearchQuery.trim()
    ? patients.filter(p => {
        const q = patientSearchQuery.toLowerCase();
        return p.healthCardId.toLowerCase().includes(q) ||
               p.name.toLowerCase().includes(q) ||
               p.id.toLowerCase().includes(q);
      })
    : [];

  // Referral creation state
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [referralPatientId, setReferralPatientId] = useState('');
  const [referralPriority, setReferralPriority] = useState<'routine' | 'urgent' | 'emergency'>('routine');
  const [referralReason, setReferralReason] = useState('');
  const [referralDestination, setReferralDestination] = useState('');
  const [referralDepartment, setReferralDepartment] = useState('');

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const patient = selectedPatient ? patients.find(p => p.id === selectedPatient) : null;
  const patientVitals = patient ? getVitalsForPatient(patient.id) : [];
  const patientReferrals = patient ? getReferralsForPatient(patient.id) : [];
  const patientConsultations = patient ? getConsultationsForPatient(patient.id) : [];

  const handleStartConsultation = (refId: string) => {
    startConsultation(refId);
    setConsultingReferral(refId);
    showFeedback('Consultation started');
  };

  const handleCompleteConsultation = (refId: string) => {
    if (consultingReferral === refId) {
      completeConsultation(refId);
      setConsultingReferral(null);

      // Add consultation record
      const ref = referrals.find(r => r.id === refId);
      if (ref) {
        addConsultationToData({
          appointmentId: ref.appointmentDate || 'a1',
          patientId: ref.patientId,
          doctorId: doctor.id,
          symptoms: [],
          diagnosis: consultationNotes || 'Consultation completed',
          prescription: prescription.split('\n').filter(Boolean),
          notes: consultationNotes,
          followupRequired: !!followupDate,
          followupDate: followupDate || undefined,
          createdAt: new Date().toISOString().split('T')[0],
        });

        // Notify patient
        addNotification({
          userId: patients.find(p => p.id === ref.patientId)?.userId || '',
          title: 'Consultation Completed',
          message: `Your consultation at ${doctorFacility?.name || 'the hospital'} has been completed. ${followupDate ? `Follow-up scheduled for ${followupDate}.` : ''}`,
          type: 'success',
          read: false,
        });
      }
      setConsultationNotes('');
      setPrescription('');
      setFollowupDate('');
      showFeedback('Consultation completed and treatment recorded');
    }
  };

  const handleScheduleFollowup = (refId: string) => {
    if (!followupDate) return;
    scheduleFollowup(refId, followupDate, '10:00');
    setFollowupDate('');
    showFeedback('Follow-up scheduled');
  };

  const handleCreateReferral = () => {
    const patientData = patients.find(p => p.id === referralPatientId);
    const destination = facilities.find(f => f.id === referralDestination);
    if (!patientData || !referralReason || !destination || !referralDepartment) {
      showFeedback('Please fill all required fields.');
      return;
    }

    createReferral({
      patientId: patientData.id,
      patientName: patientData.name,
      sourceFacilityId: doctor.facilityId,
      sourceFacilityName: doctorFacility?.name || 'Hospital',
      destinationFacilityId: destination.id,
      destinationFacilityName: destination.name,
      department: referralDepartment,
      priority: referralPriority,
      reason: referralReason,
      doctorId: doctor.id,
      doctorName: doctor.name,
      notes: `Referral created by Dr. ${doctor.name}`,
    });

    addNotification({
      userId: patientData.userId,
      title: 'Specialist Referral Created',
      message: `Dr. ${doctor.name} has referred you to ${destination.name} (${referralDepartment}). Priority: ${referralPriority}.`,
      type: referralPriority === 'emergency' ? 'alert' : 'info',
      read: false,
    });

    setShowReferralForm(false);
    setReferralPatientId('');
    setReferralPriority('routine');
    setReferralReason('');
    setReferralDestination('');
    setReferralDepartment('');
    showFeedback('Referral created successfully');
  };

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {actionFeedback && (
        <div className="fixed top-20 right-6 z-50 bg-white border border-border rounded-xl shadow-lg px-4 py-3 text-sm font-medium text-foreground animate-in fade-in slide-in-from-top-2">
          {actionFeedback}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'ta' ? 'வணக்கம்' : language === 'hi' ? 'नमस्ते' : 'Welcome'}, {doctor.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {doctor.specialization} • {doctor.qualification} • {doctor.experience}yr exp
            {doctorFacility && <span className="ml-2">• {doctorFacility.name}</span>}
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowReferralForm(!showReferralForm)}>
          <PenLine className="h-3.5 w-3.5" /> Create Referral
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{todayAppointments.length}</p>
                <p className="text-xs text-muted-foreground">{t('appointmentQueue', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{completedAppointments.length}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeReferrals.length}</p>
                <p className="text-xs text-muted-foreground">Active Referrals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{doctorFollowups.length}</p>
                <p className="text-xs text-muted-foreground">Follow-ups</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Patient Search by Health Card ID */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Stethoscope className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={patientSearchQuery}
                onChange={(e) => setPatientSearchQuery(e.target.value)}
                placeholder="Search patient by Health Card ID (e.g. AL-PT-2026-001) or name..."
                className="pl-9"
              />
            </div>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2">
              {searchResults.map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-all"
                  onClick={() => { setSelectedPatient(p.id); setPatientSearchQuery(''); }}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.healthCardId} • {p.village}, {p.district}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                    Open Record <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {patientSearchQuery && searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">No patient found matching "{patientSearchQuery}"</p>
          )}
        </CardContent>
      </Card>

      {/* Create Referral Form (inline) */}
      {showReferralForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-primary" />
                Create Specialist Referral
              </span>
              <Button variant="ghost" size="sm" onClick={() => setShowReferralForm(false)}>✕</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Patient *</label>
                <select
                  value={referralPatientId}
                  onChange={(e) => setReferralPatientId(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select patient...</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.id.toUpperCase()}) — {p.village}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Priority *</label>
                <div className="flex gap-2">
                  {(['routine', 'urgent', 'emergency'] as const).map(p => (
                    <Button
                      key={p}
                      type="button"
                      variant={referralPriority === p ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 h-10 capitalize"
                      onClick={() => setReferralPriority(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Destination Facility *</label>
                <select
                  value={referralDestination}
                  onChange={(e) => setReferralDestination(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select facility...</option>
                  {facilities.filter(f => f.id !== doctor.facilityId).map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Department *</label>
                <Input
                  value={referralDepartment}
                  onChange={(e) => setReferralDepartment(e.target.value)}
                  placeholder="e.g. Cardiology, Neurology..."
                  className="h-10"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Reason for Referral *</label>
              <textarea
                value={referralReason}
                onChange={(e) => setReferralReason(e.target.value)}
                placeholder="Describe clinical findings, diagnosis, and reason for specialist referral..."
                className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleCreateReferral}
                disabled={!referralPatientId || !referralReason || !referralDestination || !referralDepartment}
                className="gap-1.5"
              >
                <FileText className="h-4 w-4" />
                Create Referral
              </Button>
              <Button variant="outline" onClick={() => setShowReferralForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: Appointment Queue ────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-[1.125rem] w-[1.125rem] text-primary" />
                Today's Appointments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {todayAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No appointments today</p>
              ) : todayAppointments.map(apt => {
                const aptPatient = patients.find(p => p.id === apt.patientId);
                return (
                  <div
                    key={apt.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedPatient === apt.patientId ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedPatient(apt.patientId)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{aptPatient?.name || 'Patient'}</p>
                        <p className="text-xs text-muted-foreground">{apt.department} • {apt.reason}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-primary">{apt.time}</p>
                        <Badge variant="outline" className="text-[10px] mt-1">{apt.status}</Badge>
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          completeAppointment(apt.id);
                          showFeedback(`Appointment with ${aptPatient?.name || 'patient'} completed`);
                        }}
                      >
                        <CheckCircle2 className="h-3 w-3" /> Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPatient(apt.patientId);
                          setReferralPatientId(apt.patientId);
                          setShowReferralForm(true);
                        }}
                      >
                        <PenLine className="h-3 w-3" /> Refer
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Active Referrals */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-[1.125rem] w-[1.125rem] text-primary" />
                Active Referrals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeReferrals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No active referrals</p>
              ) : activeReferrals.map(ref => (
                <div key={ref.id} className="p-3 rounded-lg border border-border">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{ref.patientName}</p>
                      <p className="text-xs text-muted-foreground">{ref.referralId} • {ref.department}</p>
                      <p className="text-xs text-muted-foreground">From: {ref.sourceFacilityName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <PriorityBadge priority={ref.priority} />
                      <Badge variant="outline" className="text-[10px] capitalize">{ref.status.replace(/_/g, ' ')}</Badge>
                    </div>
                  </div>
                  <ReferralProgressMini currentStep={ref.currentStep} totalSteps={ref.totalSteps} isOverdue={ref.isOverdue} />

                  {/* Consultation Actions */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {ref.status === 'patient_arrived' && (
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => {
                        handleStartConsultation(ref.id);
                        setSelectedPatient(ref.patientId);
                      }}>
                        <PlayCircle className="h-3 w-3" /> Start Consultation
                      </Button>
                    )}
                    {ref.status === 'consultation' && (
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => {
                        setConsultingReferral(ref.id);
                        setSelectedPatient(ref.patientId);
                      }}>
                        <Stethoscope className="h-3 w-3" /> Open Consultation
                      </Button>
                    )}
                    {ref.status === 'treatment' && (
                      <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Treatment in Progress</Badge>
                    )}
                    {ref.status === 'followup' && (
                      <Badge className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Follow-up Scheduled</Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Patient Profile & Consultation ──────── */}
        <div className="space-y-4">
          {patient ? (
            <>
              {/* Patient Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-[1.125rem] w-[1.125rem] text-primary" />
                    {patient.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Age:</span> {patient.age}</div>
                    <div><span className="text-muted-foreground">Gender:</span> {patient.gender}</div>
                    <div><span className="text-muted-foreground">Village:</span> {patient.village}</div>
                    <div><span className="text-muted-foreground">Blood:</span> {patient.bloodGroup || 'N/A'}</div>
                  </div>
                  {patient.chronicConditions && patient.chronicConditions.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Chronic Conditions</p>
                      <div className="flex flex-wrap gap-1">
                        {patient.chronicConditions.map(c => (
                          <Badge key={c} variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {patient.allergies && patient.allergies.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Allergies</p>
                      <div className="flex flex-wrap gap-1">
                        {patient.allergies.map(a => (
                          <Badge key={a} variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">{a}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Patient Referrals */}
              {patientReferrals.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-[1.125rem] w-[1.125rem] text-primary" />
                      Patient Referrals
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {patientReferrals.map(r => (
                      <div key={r.id} className="p-2 rounded-lg bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{r.referralId}</p>
                            <p className="text-xs text-muted-foreground">{r.department} → {r.destinationFacilityName}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize">{r.status.replace(/_/g, ' ')}</Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Latest Vitals */}
              {patientVitals.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-[1.125rem] w-[1.125rem] text-primary" />
                      Latest Vitals
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {patientVitals[0].bloodPressureSystolic && (
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-sm font-bold">{patientVitals[0].bloodPressureSystolic}/{patientVitals[0].bloodPressureDiastolic}</p>
                          <p className="text-[10px] text-muted-foreground">BP</p>
                        </div>
                      )}
                      {patientVitals[0].heartRate && (
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-sm font-bold">{patientVitals[0].heartRate}</p>
                          <p className="text-[10px] text-muted-foreground">Heart Rate</p>
                        </div>
                      )}
                      {patientVitals[0].spO2 && (
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-sm font-bold">{patientVitals[0].spO2}%</p>
                          <p className="text-[10px] text-muted-foreground">SpO2</p>
                        </div>
                      )}
                      {patientVitals[0].bloodSugar && (
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-sm font-bold">{patientVitals[0].bloodSugar}</p>
                          <p className="text-[10px] text-muted-foreground">Blood Sugar</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Consultation Form (when actively consulting) */}
              {consultingReferral && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Stethoscope className="h-[1.125rem] w-[1.125rem] text-primary" />
                      Consultation Notes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      value={consultationNotes}
                      onChange={(e) => setConsultationNotes(e.target.value)}
                      placeholder="Enter consultation notes, diagnosis, findings..."
                      className="min-h-[80px]"
                    />
                    <Textarea
                      value={prescription}
                      onChange={(e) => setPrescription(e.target.value)}
                      placeholder="Prescription (one item per line)..."
                      className="min-h-[60px]"
                    />
                    <Input
                      type="date"
                      value={followupDate}
                      onChange={(e) => setFollowupDate(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleCompleteConsultation(consultingReferral)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Complete Consultation
                      </Button>
                      {followupDate && (
                        <Button size="sm" variant="outline" onClick={() => handleScheduleFollowup(consultingReferral)}>
                          <Clock className="h-3.5 w-3.5 mr-1" /> Schedule Follow-up
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Previous Consultations */}
              {patientConsultations.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Previous Consultations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {patientConsultations.map(c => (
                      <div key={c.id} className="p-2 rounded-lg bg-muted/30 text-sm">
                        <p className="font-medium">{c.diagnosis}</p>
                        <p className="text-xs text-muted-foreground">{c.notes}</p>
                        <p className="text-xs text-muted-foreground mt-1">{c.createdAt}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select a patient from the appointment queue to view their profile</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
