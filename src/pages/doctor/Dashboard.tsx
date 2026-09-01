// ============================================================================
// Doctor Dashboard
// ============================================================================

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { AIDisclaimer } from '@/components/shared/AIDisclaimer';
import {
  patients, appointments, consultations, vitals, doctors, referrals, healthRecords
} from '@/lib/mock-data';
import {
  Calendar, Users, FileText, Clock, Activity, Stethoscope,
  ChevronRight
} from 'lucide-react';

export default function DoctorDashboard() {
  const { language } = useApp();
  const doctor = doctors[2]; // Dr. Rajesh Verma (Cardiology)
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);

  const doctorAppointments = appointments.filter(a => a.doctorId === doctor.id);
  const todayAppointments = doctorAppointments.filter(a => a.date === '2026-07-30');
  const allAppointments = doctorAppointments;
  const doctorReferrals = referrals.filter(r => r.doctorId === doctor.id);

  const patient = selectedPatient ? patients.find(p => p.id === selectedPatient) : null;
  const patientVitals = patient ? vitals.find(v => v.patientId === patient.id) : null;
  const patientRecords = patient ? healthRecords.filter(r => r.patientId === patient.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {language === 'ta' ? 'வணக்கம்' : language === 'hi' ? 'नमस्ते' : 'Hello'}, {doctor.name} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {doctor.specialization} • {doctor.facilityId === 'f3' ? 'Madurai District Hospital' : 'Hospital'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{todayAppointments.length}</p>
                <p className="text-xs text-muted-foreground">{t('today', language)}'s Appointments</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{allAppointments.length}</p>
                <p className="text-xs text-muted-foreground">{t('appointmentQueue', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{doctorReferrals.length}</p>
                <p className="text-xs text-muted-foreground">Active Referrals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{consultations.filter(c => c.doctorId === doctor.id).length}</p>
                <p className="text-xs text-muted-foreground">Consultations Done</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="queue">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="queue">{t('appointmentQueue', language)}</TabsTrigger>
          <TabsTrigger value="patient">{t('patientProfile', language)}</TabsTrigger>
          <TabsTrigger value="referrals">{t('myReferrals', language)}</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4 space-y-3">
          {allAppointments.map(apt => {
            const p = patients.find(pt => pt.id === apt.patientId);
            return (
              <Card key={apt.id} className="cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => setSelectedPatient(apt.patientId)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {p?.name.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{p?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{apt.department} • {apt.date} {apt.time}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{apt.reason}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">{apt.status}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="patient" className="mt-4">
          {patient ? (
            <div className="space-y-4">
              {/* Patient Header */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                      {patient.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground">{patient.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {patient.gender === 'female' ? 'Female' : 'Male'} • Age {patient.age} • {patient.bloodGroup}
                      </p>
                      <p className="text-xs text-muted-foreground">{patient.address}, {patient.village}</p>
                    </div>
                    {patient.chronicConditions && patient.chronicConditions.length > 0 && (
                      <div className="text-right">
                        <RiskBadge level="high" size="sm" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Vitals */}
              {patientVitals && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      {t('vitals', language)} — {patientVitals.date}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                      {patientVitals.bloodPressureSystolic && (
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-xs text-muted-foreground">BP</p>
                          <p className="text-sm font-bold">{patientVitals.bloodPressureSystolic}/{patientVitals.bloodPressureDiastolic}</p>
                        </div>
                      )}
                      {patientVitals.heartRate && (
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-xs text-muted-foreground">HR</p>
                          <p className="text-sm font-bold">{patientVitals.heartRate}</p>
                        </div>
                      )}
                      {patientVitals.temperature && (
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-xs text-muted-foreground">Temp</p>
                          <p className="text-sm font-bold">{patientVitals.temperature}°F</p>
                        </div>
                      )}
                      {patientVitals.spO2 && (
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-xs text-muted-foreground">SpO2</p>
                          <p className="text-sm font-bold">{patientVitals.spO2}%</p>
                        </div>
                      )}
                      {patientVitals.bloodSugar && (
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-xs text-muted-foreground">Sugar</p>
                          <p className="text-sm font-bold">{patientVitals.bloodSugar}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AI Triage Result */}
              <Card className="border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-blue-600" />
                    AI Triage Result
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <RiskBadge level="high" size="sm" />
                    <span className="text-xs text-muted-foreground">Confidence: 87%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Chest pain with history of atrial fibrillation. Urgent cardiology evaluation recommended.
                  </p>
                  <AIDisclaimer />
                </CardContent>
              </Card>

              {/* Health Timeline */}
              {patientRecords.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{t('medicalTimeline', language)}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {patientRecords.map(r => (
                      <div key={r.id} className="flex gap-3 text-sm p-2 rounded-lg hover:bg-muted/30">
                        <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">{r.title}</p>
                          <p className="text-xs text-muted-foreground">{r.date} • {r.facilityName}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Consultation Form */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{t('consultationNotes', language)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <textarea
                    className="w-full min-h-[100px] rounded-lg border border-border p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Enter consultation notes, findings, and diagnosis..."
                  />
                  <div className="flex gap-2">
                    <Button size="sm">{t('createPrescription', language)}</Button>
                    <Button size="sm" variant="outline">{t('createReferral', language)}</Button>
                    <Button size="sm" variant="outline">{t('followUpReminders', language)}</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Select a patient from the appointment queue to view their profile
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="referrals" className="mt-4 space-y-3">
          {doctorReferrals.map(ref => (
            <Card key={ref.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{ref.patientName} — {ref.referralId}</p>
                    <p className="text-xs text-muted-foreground">{ref.department} • {ref.destinationFacilityName}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">{ref.status.replace(/_/g, ' ')}</Badge>
                </div>
                <ReferralProgressMini currentStep={ref.currentStep} totalSteps={ref.totalSteps} isOverdue={ref.isOverdue} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
