// ============================================================================
// Doctor Dashboard — Functional Consultation & Referral Management
// ============================================================================

import { useState } from 'react';
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
  CheckCircle2, PlayCircle, AlertTriangle
} from 'lucide-react';

export default function DoctorDashboard() {
  const { language } = useApp();
  const {
    doctors, patients, appointments, referrals, followups, consultations,
    getAppointmentsForDoctor, getReferralsForPatient, getVitalsForPatient,
    getConsultationsForPatient,
    startConsultation, completeConsultation, addTreatment, scheduleFollowup, closeReferral,
    addConsultation: addConsultationToData
  } = useData();

  const doctor = doctors[0]; // Dr. Senthil Kumar
  const doctorAppointments = getAppointmentsForDoctor(doctor.id);
  const todayAppointments = doctorAppointments.filter(a => a.status === 'scheduled');
  const completedAppointments = doctorAppointments.filter(a => a.status === 'completed');
  const activeReferrals = referrals.filter(r => r.doctorId === doctor.id && r.status !== 'closed');
  const doctorFollowups = followups.filter(f => f.doctorId === doctor.id);

  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [consultationNotes, setConsultationNotes] = useState('');
  const [prescription, setPrescription] = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [consultingReferral, setConsultingReferral] = useState<string | null>(null);

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
          appointmentId: 'a1', patientId: ref.patientId, doctorId: doctor.id,
          symptoms: [], diagnosis: consultationNotes || 'Consultation completed',
          prescription: prescription.split('\n').filter(Boolean),
          notes: consultationNotes,
          followupRequired: !!followupDate,
          followupDate: followupDate || undefined,
          createdAt: new Date().toISOString().split('T')[0],
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

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {actionFeedback && (
        <div className="fixed top-20 right-6 z-50 bg-white border border-border rounded-xl shadow-lg px-4 py-3 text-sm font-medium text-foreground animate-in fade-in slide-in-from-top-2">
          {actionFeedback}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {language === 'ta' ? 'வணக்கம்' : language === 'hi' ? 'नमस्ते' : 'Welcome'}, {doctor.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {doctor.specialization} • {doctor.qualification} • {doctor.experience}yr exp
        </p>
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
                    </div>
                    <PriorityBadge priority={ref.priority} />
                  </div>
                  <ReferralProgressMini currentStep={ref.currentStep} totalSteps={ref.totalSteps} isOverdue={ref.isOverdue} />

                  {/* Consultation Actions */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {ref.status === 'patient_arrived' && (
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleStartConsultation(ref.id)}>
                        <PlayCircle className="h-3 w-3" /> Start Consultation
                      </Button>
                    )}
                    {ref.status === 'consultation' && (
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { setConsultingReferral(ref.id); }}>
                        <Stethoscope className="h-3 w-3" /> Open Consultation
                      </Button>
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
                </CardContent>
              </Card>

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
