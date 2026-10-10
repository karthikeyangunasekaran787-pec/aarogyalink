// ============================================================================
// AarogyaLink — Doctor: Scan Health Card / walk-in patient
// ----------------------------------------------------------------------------
// The second way into a patient record. The camera (or the manual fallback)
// reads the Health Card reference, the BACKEND authorizes it and answers with
// the patient's longitudinal record, and the doctor either continues an active
// referral or records a walk-in consultation.
//
// Nothing here decides access: every action below is a request the backend
// validates against the stored session binding and the stored patient links.
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Consultation, Followup, MedicalReport, Referral, Vitals } from '@/types';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { HealthCardScanner } from '@/components/care/HealthCardScanner';
import { ReportList } from '@/components/reports/ReportList';
import { ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { formatReportDate, parseHealthCardQr } from '@/lib/health-card';
import {
  Activity, AlertCircle, ArrowRight, BadgeCheck, CalendarClock, CheckCircle2,
  KeyRound, Loader2, ScanLine, Stethoscope, UserRound, X,
} from 'lucide-react';

interface CarePatientCard {
  id?: string;
  name: string;
  healthCardId: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
  phone?: string;
  emergencyContact?: string;
  village?: string;
  district?: string;
  allergies?: string[];
  chronicConditions?: string[];
}

interface CareAuthorization {
  source: string;
  walkIn: boolean;
  hospitalId: string;
  hospitalName?: string;
  verifiedAt: string;
}

interface CareReferral {
  id?: string;
  referralId?: string;
  sourceFacilityName?: string;
  destinationFacilityName?: string;
  department?: string;
  priority?: string;
  status: string;
  statusLabel: string;
  currentStep?: number;
  totalSteps?: number;
  appointmentDate?: string;
  appointmentTime?: string;
}

interface CareRecord {
  patient: CarePatientCard;
  vitals: Vitals[];
  reports: MedicalReport[];
  consultations: Consultation[];
  referrals: Referral[];
  followups: Followup[];
  activeReferral: CareReferral | null;
  authorization: CareAuthorization;
  message: string;
}

type ScanOutcome = { ok: true; record: CareRecord } | { ok: false; message: string };

export default function ScanHealthCard() {
  const { isOffline } = useApp();
  const navigate = useNavigate();
  const authorizeScan = useMutation(api.appCare.authorizeHealthCardScan);
  const saveWalkIn = useMutation(api.appCare.startWalkInConsultation);

  const [manualMode, setManualMode] = useState(false);
  const [manualId, setManualId] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  const [record, setRecord] = useState<CareRecord | null>(null);
  const [consultOpen, setConsultOpen] = useState(false);

  // Walk-in consultation form
  const [diagnosis, setDiagnosis] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [prescription, setPrescription] = useState('');
  const [notes, setNotes] = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const verify = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) {
      setError('Enter the Health Card ID to continue.');
      return;
    }
    setError(null);
    setFeedback(null);
    setConsultOpen(false);
    setVerifying(true);
    try {
      const result = await authorizeScan({ scanned: value });
      if (!result.ok) {
        setRecord(null);
        setError(result.message);
        return;
      }
      setScanned(value);
      setRecord(result as unknown as CareRecord);
      setManualMode(false);
      setManualId('');
    } catch {
      setRecord(null);
      setError(
        isOffline
          ? 'You are offline. Please reconnect to access the latest patient record.'
          : 'Could not verify this Health Card. Check your connection and try again.',
      );
    } finally {
      setVerifying(false);
    }
  }, [authorizeScan, isOffline]);

  // Stable handler: the scanner restarts whenever this identity changes.
  const handleDetected = useCallback((raw: string) => { void verify(raw); }, [verify]);

  const rescan = () => {
    setRecord(null);
    setScanned(null);
    setError(null);
    setFeedback(null);
    setConsultOpen(false);
  };

  const handleRecordConsultation = async () => {
    if (!record?.patient.id) return;
    if (!diagnosis.trim()) {
      setFormError('Enter the diagnosis or consultation summary.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const result = await saveWalkIn({
        patientId: record.patient.id,
        diagnosis: diagnosis.trim(),
        symptoms: symptoms.split(',').map(s => s.trim()).filter(Boolean),
        prescription: prescription.split('\n').map(s => s.trim()).filter(Boolean),
        notes: notes.trim() || undefined,
        followupRequired: !!followupDate,
        followupDate: followupDate || undefined,
      });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setFeedback(result.message);
      setDiagnosis('');
      setSymptoms('');
      setPrescription('');
      setNotes('');
      setFollowupDate('');
      setConsultOpen(false);
      // Re-read the record so the new consultation shows in the history.
      if (scanned) await verify(scanned);
    } catch {
      setFormError('Could not save the consultation. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const latestVitals = useMemo(() => record?.vitals?.[0], [record]);
  const referrals = record?.referrals ?? [];
  const activeReferral = record?.activeReferral ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ScanLine className="h-6 w-6 text-primary" />
            Scan Health Card
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open any patient&apos;s AarogyaLink record with their Health Card — an appointment is not required.
          </p>
        </div>
        <Button variant="outline" className="gap-1.5" asChild>
          <Link to="/doctor/appointments">
            <CalendarClock className="h-4 w-4" /> Appointments
          </Link>
        </Button>
      </div>

      {isOffline && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>You are offline. Please reconnect to access the latest patient record.</span>
        </div>
      )}

      {!record && (
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-5">
            {manualMode ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Enter Health Card ID manually</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={manualId}
                    onChange={event => { setManualId(event.target.value); setError(null); }}
                    onKeyDown={event => { if (event.key === 'Enter') void verify(manualId); }}
                    placeholder="e.g. AL-PT-2026-001"
                    autoFocus
                  />
                  <Button onClick={() => void verify(manualId)} disabled={verifying} className="gap-1.5 sm:w-auto">
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                    Verify Health Card
                  </Button>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => { setManualMode(false); setError(null); }}
                >
                  ← Use the camera instead
                </button>
              </div>
            ) : (
              <>
                <HealthCardScanner onDetected={handleDetected} />
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    className="text-sm font-medium text-primary hover:underline"
                    onClick={() => { setManualMode(true); setError(null); }}
                  >
                    Enter Health Card ID manually
                  </button>
                  {verifying && (
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Verifying with AarogyaLink…
                    </span>
                  )}
                </div>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {record && (
        <div className="space-y-4">
          {/* Authorization banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-start gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-medium">{record.message}</p>
                <p className="text-xs">
                  Verified at {record.authorization.hospitalName ?? 'your hospital'} •{' '}
                  {record.authorization.walkIn ? 'Walk-in (Health Card)' : 'Existing care record'}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={rescan}>
              <X className="h-3.5 w-3.5" /> Scan another card
            </Button>
          </div>

          {/* Patient health card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <UserRound className="h-[1.125rem] w-[1.125rem] text-primary" />
                Patient Health Card
                {record.authorization.walkIn && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                    Walk-in Patient
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Patient Name</p>
                  <p className="text-sm font-semibold text-foreground">{record.patient.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Health Card ID</p>
                  <p className="font-mono text-sm font-semibold text-primary">{record.patient.healthCardId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Age / Gender</p>
                  <p className="text-sm font-semibold capitalize text-foreground">
                    {record.patient.age ? `${record.patient.age} yrs` : '—'} • {record.patient.gender ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Blood Group</p>
                  <p className="text-sm font-semibold text-foreground">{record.patient.bloodGroup || 'Not recorded'}</p>
                </div>
              </div>
              {(record.patient.allergies?.length || record.patient.chronicConditions?.length) ? (
                <div className="flex flex-wrap gap-1.5">
                  {record.patient.allergies?.map(a => (
                    <Badge key={a} variant="outline" className="border-red-200 bg-red-50 text-[10px] text-red-700">Allergy: {a}</Badge>
                  ))}
                  {record.patient.chronicConditions?.map(c => (
                    <Badge key={c} variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">{c}</Badge>
                  ))}
                </div>
              ) : null}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                {activeReferral ? (
                  <>
                    <Button className="gap-1.5" onClick={() => navigate('/doctor/referrals')}>
                      <ArrowRight className="h-4 w-4" /> Continue Referral
                    </Button>
                    <Button variant="outline" className="gap-1.5" onClick={() => setConsultOpen(true)}>
                      <Stethoscope className="h-4 w-4" /> Start Consultation
                    </Button>
                  </>
                ) : (
                  <Button className="gap-1.5" onClick={() => setConsultOpen(open => !open)}>
                    <Stethoscope className="h-4 w-4" /> Start Consultation
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {feedback && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</p>
          )}

          {/* Walk-in consultation form */}
          {consultOpen && (
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {record.authorization.walkIn ? 'Walk-in Consultation' : 'Consultation'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={diagnosis}
                  onChange={event => { setDiagnosis(event.target.value); setFormError(null); }}
                  placeholder="Diagnosis / consultation summary *"
                  className="min-h-[70px]"
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    value={symptoms}
                    onChange={event => setSymptoms(event.target.value)}
                    placeholder="Symptoms (comma separated)"
                  />
                  <Input
                    type="date"
                    value={followupDate}
                    onChange={event => setFollowupDate(event.target.value)}
                  />
                </div>
                <Textarea
                  value={prescription}
                  onChange={event => setPrescription(event.target.value)}
                  placeholder="Prescription (one item per line)"
                  className="min-h-[60px]"
                />
                <Textarea
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                  placeholder="Notes (optional)"
                  className="min-h-[50px]"
                />
                {formError && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4" /> {formError}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={() => void handleRecordConsultation()} disabled={saving} className="gap-1.5">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Record Consultation
                  </Button>
                  <Button variant="outline" onClick={() => setConsultOpen(false)} disabled={saving}>Cancel</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Recorded as a WALK-IN visit against the Health Card. No appointment or referral is created for the patient.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Latest vitals */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-[1.125rem] w-[1.125rem] text-primary" />
                Latest Vitals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {latestVitals ? (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Recorded {latestVitals.date} by {latestVitals.recordedBy}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {latestVitals.bloodPressureSystolic ? (
                      <div className="rounded-lg border border-border bg-white p-2 text-center">
                        <p className="text-sm font-bold text-foreground">{latestVitals.bloodPressureSystolic}/{latestVitals.bloodPressureDiastolic}</p>
                        <p className="text-[10px] text-muted-foreground">BP (mmHg)</p>
                      </div>
                    ) : null}
                    {latestVitals.spO2 ? (
                      <div className="rounded-lg border border-border bg-white p-2 text-center">
                        <p className="text-sm font-bold text-foreground">{latestVitals.spO2}%</p>
                        <p className="text-[10px] text-muted-foreground">SpO2</p>
                      </div>
                    ) : null}
                    {latestVitals.temperature ? (
                      <div className="rounded-lg border border-border bg-white p-2 text-center">
                        <p className="text-sm font-bold text-foreground">{latestVitals.temperature}°F</p>
                        <p className="text-[10px] text-muted-foreground">Temperature</p>
                      </div>
                    ) : null}
                    {latestVitals.heartRate ? (
                      <div className="rounded-lg border border-border bg-white p-2 text-center">
                        <p className="text-sm font-bold text-foreground">{latestVitals.heartRate}</p>
                        <p className="text-[10px] text-muted-foreground">Heart rate</p>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No vitals recorded for this patient yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Medical reports */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Medical Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportList
                reports={record.reports ?? []}
                emptyMessage="No medical reports have been uploaded for this patient."
              />
            </CardContent>
          </Card>

          {/* Referral history */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Referral History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeReferral && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Active Referral</p>
                    <Badge variant="outline" className="text-[10px]">{activeReferral.statusLabel}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Source: {activeReferral.sourceFacilityName ?? '—'} → Destination: {activeReferral.destinationFacilityName ?? '—'}
                  </p>
                  {typeof activeReferral.currentStep === 'number' && typeof activeReferral.totalSteps === 'number' && (
                    <ReferralProgressMini
                      currentStep={activeReferral.currentStep}
                      totalSteps={activeReferral.totalSteps}
                      isOverdue={false}
                    />
                  )}
                </div>
              )}
              {referrals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No referrals for this patient.</p>
              ) : referrals.map(referral => (
                <div key={referral.id} className="rounded-lg bg-muted/30 p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{referral.referralId}</p>
                      <p className="text-xs text-muted-foreground">
                        {referral.department} • {referral.sourceFacilityName} → {referral.destinationFacilityName}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize">{referral.status.replace(/_/g, ' ')}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Consultations + follow-ups */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Previous Consultations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(record.consultations ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No consultations recorded yet.</p>
                ) : (record.consultations ?? []).map(consultation => (
                  <div key={consultation.id} className="rounded-lg bg-muted/30 p-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-foreground">{consultation.diagnosis}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {consultation.consultationType === 'WALK_IN' ? 'Walk-in' : 'Appointment'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatReportDate(consultation.consultationDate ?? consultation.createdAt)}
                      {consultation.doctorName ? ` • ${consultation.doctorName}` : ''}
                      {consultation.facilityName ? ` • ${consultation.facilityName}` : ''}
                    </p>
                    {consultation.notes && <p className="mt-1 text-xs text-muted-foreground">{consultation.notes}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Follow-up</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(record.followups ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No follow-up scheduled.</p>
                ) : (record.followups ?? []).map(followup => (
                  <div key={followup.id} className="rounded-lg bg-muted/30 p-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-foreground">{formatReportDate(followup.scheduledDate)} {followup.scheduledTime}</p>
                      <Badge variant="outline" className="text-[10px] capitalize">{followup.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{followup.doctorName} • {followup.facilityName}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
