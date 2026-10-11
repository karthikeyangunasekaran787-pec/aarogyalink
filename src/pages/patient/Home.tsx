// ============================================================================
// Patient Home Dashboard
// ----------------------------------------------------------------------------
// Designed for an ordinary patient, including someone with limited digital
// literacy: one welcome line, then the things that actually matter — the Health
// Card they carry, the care they are being referred for, their appointments,
// the reports filed for them, and their own details. Nothing else.
//
// Every number and every list on this page comes from the real collections
// (referrals, appointments, reports, vitals). Where there is no record the
// section shows a short empty state instead of an invented figure — the page
// previously displayed hard-coded vitals and an empty notification card, both
// of which are gone.
//
// The whole page is translated: the language selector re-renders it because
// `t` comes from AppContext's language (via useTranslation).
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router';

import { useApp } from '@/contexts/AppContext';
import { useData } from '@/contexts/DataContext';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { UnlinkedPatientNotice } from '@/components/shared/UnlinkedPatientNotice';
import { nextReferralStepKey, referralStatusKey } from '@/lib/referral-labels';
import {
  Activity, AlertTriangle, Calendar, Check, Copy, CreditCard, FileText,
  Phone, Pill, Stethoscope, User,
} from 'lucide-react';

/** A short, human date for the selected locale (falls back to the raw value). */
function formatDate(value: string | undefined, language: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return date.toLocaleDateString(language === 'ta' ? 'ta-IN' : language === 'hi' ? 'hi-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

function SectionEmpty({ title, hint, icon: Icon }: { title: string; hint: string; icon: typeof FileText }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function PatientHome() {
  const { currentUser, isOffline } = useApp();
  const { t, language } = useTranslation();
  const {
    patients, appointments, facilities, hospitals, getReferralsForPatient,
    getReportsForPatient, getVitalsForPatient, getFacilityById, getDoctorById,
  } = useData();

  const [copied, setCopied] = useState(false);

  // Never fall back to another patient's record: an unlinked account must not
  // see someone else's health data.
  const patient = patients.find(p => p.id === currentUser?.patientId);
  if (!patient) return <UnlinkedPatientNotice />;

  const facilityName = (id?: string) =>
    (id ? facilities.find(f => f.id === id)?.name ?? hospitals.find(h => h.id === id)?.name : undefined) ??
    (id ? getFacilityById(id)?.name : undefined);

  const referrals = getReferralsForPatient(patient.id);
  // Active = not yet finished. Only the stored status decides that.
  const activeReferrals = referrals.filter(r => r.status !== 'closed' && r.status !== 'cancelled');
  const shownReferrals = [...activeReferrals, ...referrals.filter(r => r.status === 'closed' || r.status === 'cancelled')];

  const upcomingAppointments = appointments
    .filter(a => a.patientId === patient.id && (a.status === 'scheduled' || a.status === 'confirmed'))
    .slice()
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const reports = getReportsForPatient(patient.id);
  const shownReports = reports.slice(0, 3);

  // Real vitals only. The most recent reading by recorded date, if any.
  const vitals = getVitalsForPatient(patient.id).slice().sort((a, b) => a.date.localeCompare(b.date));
  const latestVitals = vitals.length > 0 ? vitals[vitals.length - 1] : undefined;

  const copyHealthCardId = () => {
    navigator.clipboard
      .writeText(patient.healthCardId)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => { /* clipboard unavailable — the id is visible anyway */ });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* ── Welcome ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {t('welcomeBackName', { name: patient.name.split(' ')[0] })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('patientSummary')}</p>
      </div>

      {isOffline && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{t('noInternet')}</span>
        </div>
      )}

      {/* ── Health Card (primary) ───────────────────────────────── */}
      <Card className="border-primary/25">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{patient.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('healthCardId')}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold tracking-tight text-primary">
                  {patient.healthCardId}
                </span>
                <button
                  type="button"
                  onClick={copyHealthCardId}
                  aria-label={t('copyHealthCardId')}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  {copied ? t('copied') : t('copy')}
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/patient/health-card">
                <CreditCard className="mr-1.5 h-4 w-4" />
                {t('viewHealthCard')}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/patient/appointments">
                <Calendar className="mr-1.5 h-4 w-4" />
                {t('myAppointments')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── My Referrals ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('myReferrals')}
            </CardTitle>
            {referrals.length > 0 && (
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link to="/patient/referrals">{t('viewAll')}</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {shownReferrals.length === 0 ? (
            <SectionEmpty title={t('noReferralsYet')} hint={t('noReferralsHint')} icon={Stethoscope} />
          ) : (
            <ul className="space-y-3">
              {shownReferrals.slice(0, 3).map(ref => {
                const nextKey = nextReferralStepKey(ref.status);
                return (
                  <li key={ref.id}>
                    <Link
                      to={`/patient/referrals/${ref.id}`}
                      className="block rounded-xl border border-border p-3.5 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{ref.destinationFacilityName}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {ref.department} • {t('referralDate')}: {formatDate(ref.createdAt, language)}
                          </p>
                        </div>
                        {/* Status is a text badge, never colour alone. */}
                        <Badge
                          variant="outline"
                          className={
                            ref.status === 'closed' || ref.status === 'cancelled'
                              ? 'border-border text-muted-foreground'
                              : 'border-primary/30 bg-primary/5 text-primary'
                          }
                        >
                          {t(referralStatusKey(ref.status))}
                        </Badge>
                      </div>
                      <div className="mt-2.5">
                        <ReferralProgressMini
                          currentStep={ref.currentStep}
                          totalSteps={ref.totalSteps}
                          isOverdue={ref.isOverdue}
                        />
                      </div>
                      {nextKey && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t('nextAction')}: {t(nextKey)}
                        </p>
                      )}
                      {ref.isOverdue && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                          <AlertTriangle className="h-3 w-3" />
                          {t('overdueLabel')}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Appointments ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('upcomingAppointments')}
            </CardTitle>
            {upcomingAppointments.length > 0 && (
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link to="/patient/appointments">{t('viewAll')}</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {upcomingAppointments.length === 0 ? (
            <SectionEmpty title={t('noAppointmentsYet')} hint={t('noAppointmentsHint')} icon={Calendar} />
          ) : (
            <ul className="space-y-3">
              {upcomingAppointments.slice(0, 3).map(apt => {
                const doctor = apt.doctorId ? getDoctorById(apt.doctorId) : undefined;
                return (
                  <li key={apt.id} className="rounded-xl border border-border p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{apt.department}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{apt.reason}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-primary">{formatDate(apt.date, language)}</p>
                        <p className="text-xs text-muted-foreground">{apt.time}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {facilityName(apt.facilityId) && <span>{facilityName(apt.facilityId)}</span>}
                      {doctor && (
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {t('doctor')}: {doctor.name}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className="border-blue-200 bg-blue-50 text-[10px] text-blue-700"
                      >
                        {t('scheduled')}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── My Reports ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('myReports')}
            </CardTitle>
            {reports.length > 0 && (
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link to="/patient/reports">{t('viewAll')}</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {shownReports.length === 0 ? (
            <SectionEmpty title={t('noReportsYet')} hint={t('noReportsHint')} icon={Pill} />
          ) : (
            <ul className="divide-y divide-border">
              {shownReports.map(report => (
                <li key={report.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{report.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(report.reportDate, language)}
                      {report.facilityName ? ` • ${report.facilityName}` : ''}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="flex-shrink-0">
                    <Link to="/patient/reports">{t('viewReport')}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Latest vitals (only when a real reading exists) ─────── */}
      {latestVitals && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('latestVitals')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: t('bloodPressure'),
                  value:
                    latestVitals.bloodPressureSystolic && latestVitals.bloodPressureDiastolic
                      ? `${latestVitals.bloodPressureSystolic}/${latestVitals.bloodPressureDiastolic}`
                      : undefined,
                  unit: 'mmHg',
                },
                { label: t('heartRate'), value: latestVitals.heartRate, unit: 'bpm' },
                { label: t('bloodSugar'), value: latestVitals.bloodSugar, unit: 'mg/dL' },
                { label: t('weight'), value: latestVitals.weight, unit: 'kg' },
              ]
                .filter(row => row.value !== undefined && row.value !== null && row.value !== '')
                .map(row => (
                  <div key={row.label} className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-lg font-bold text-foreground">
                      {row.value}
                      <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">{row.unit}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{row.label}</p>
                  </div>
                ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t('recordedOn', { date: formatDate(latestVitals.date, language) })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Your details ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('yourDetails')}
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link to="/patient/profile">{t('myProfile')}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: t('fullName'), value: patient.name },
              { label: t('phone'), value: patient.phone || t('notProvided') },
              { label: t('bloodGroup'), value: patient.bloodGroup || t('notProvided') },
              { label: t('registeredFacility'), value: facilityName(patient.registeredByFacilityId) || t('notProvided') },
              { label: t('address'), value: `${patient.village}, ${patient.district}` },
              { label: t('date'), value: formatDate(patient.registeredAt, language) },
            ].map(row => (
              <div key={row.label} className="rounded-lg bg-muted/40 px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{row.label}</dt>
                <dd className="break-words text-sm font-medium text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* ── Emergency help (safety, always last and always visible) ─ */}
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-red-100">
            <Phone className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-red-900">{t('emergencyHelp')}</h3>
            <p className="mt-0.5 text-xs text-red-700/80">{t('emergencyCallHint')}</p>
          </div>
          <a href="tel:108">
            <Button variant="destructive" size="sm" className="gap-1.5">
              <Phone className="h-4 w-4" />
              108
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
