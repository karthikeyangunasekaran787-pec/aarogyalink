// ============================================================================
// Book Appointment for Patient — Health Worker workflow
// ----------------------------------------------------------------------------
//   Select / Find Patient → Choose Hospital → View Doctors → Select Doctor
//   → Available Slots → Date & Time → Reason for Visit → Confirm Booking
//   → Appointment Created
//
// The presentational workflow takes everything from props, so every step and
// every failure state can be rendered in a test (no Convex provider needed).
// The container below is what talks to the backend: the hospitals, doctors and
// slots it shows are the ones the SERVER says this caller may use, and the
// booking is only confirmed after the mutation returns the stored appointment.
// ============================================================================

import { useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { usePatientRegistry } from '@/hooks/use-patient-registry';
import {
  useAppointmentBookingActions,
  useAppointmentSlots,
  useBookingHospitals,
  useHospitalDoctors,
  useMyBookedAppointments,
  type BookingActionResult,
  type BookingAppointment,
} from '@/hooks/use-appointment-booking';
import {
  appointmentArrivalLabelKey,
  appointmentRights,
  appointmentStatusLabelKey,
  formatAppointmentTime,
  normalizeAvailabilityDays,
  todayIso,
  validateBookingRequest,
  type BookingDoctor,
  type BookingError,
  type BookingHospital,
  type SlotAvailability,
} from '@/lib/appointment-booking';
import type { PatientLookup } from '@/hooks/use-patient-registry';
import type { TranslationKey } from '@/lib/i18n';
import type { Appointment, Referral } from '@/types';
import { useTranslation, type Translation } from '@/hooks/use-translation';
import { useSubmitGuard } from '@/hooks/use-submit-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  PatientLookupField,
  PatientLookupStatus,
  PatientVerificationCard,
  type PatientRecordCounts,
} from '@/components/patients/FindPatientPanel';
import {
  AlertCircle, ArrowRight, Building2, Calendar, CheckCircle2, ChevronDown,
  ChevronUp, Clock, FileText, MapPin, RefreshCw, Stethoscope, Users, X,
} from 'lucide-react';

// ── Small helpers ─────────────────────────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  missed: 'bg-red-50 text-red-700 border-red-200',
};

/** Translated label for a booking validation error (falls back to the server text). */
function errorLabel(error: BookingError, t: Translation['t']): string {
  const keys: Partial<Record<BookingError['code'], TranslationKey>> = {
    slot_taken: 'slotJustTaken',
    doctor_unavailable: 'doctorUnavailableOnDate',
    invalid_time: 'errSelectSlot',
    invalid_date: 'errSelectSlot',
    past_date: 'errSelectSlot',
    reason_required: 'errBookingReason',
    reason_too_long: 'errBookingReason',
  };
  const key = keys[error.code];
  return key ? t(key) : error.message;
}

function formatDays(days: string[] | undefined): string {
  const normalized = normalizeAvailabilityDays(days);
  return normalized.length > 0 ? normalized.join(', ') : '—';
}

/** One status badge, translated. */
export function AppointmentStatusBadge({ appointment }: { appointment: Appointment }) {
  const { t } = useTranslation();
  const key = appointmentStatusLabelKey(appointment.status) as TranslationKey;
  return (
    <Badge className={`border text-[10px] ${STATUS_CLASSES[appointment.status] ?? STATUS_CLASSES.cancelled}`}>
      {t(key)}
    </Badge>
  );
}

// ── Props ─────────────────────────────────────────────────────────

export interface BookingWorkflowProps {
  lookup: PatientLookup;
  recordCounts: (patientId: string) => PatientRecordCounts;
  onPatientSearch: (code: string) => void;
  onPatientReset: () => void;

  hospitals: BookingHospital[];
  hospitalsLoading: boolean;
  hospitalsMessage?: string;
  hospitalId: string;
  onSelectHospital: (id: string) => void;

  doctors: BookingDoctor[];
  doctorsLoading: boolean;
  doctorsMessage?: string;
  doctorId: string;
  onSelectDoctor: (id: string) => void;

  date: string;
  onDateChange: (date: string) => void;
  slots: SlotAvailability[];
  slotsLoading: boolean;
  slotsMessage?: string;
  doctorAvailable: boolean;
  availableDates: string[];
  time: string;
  onTimeChange: (time: string) => void;

  reason: string;
  onReasonChange: (reason: string) => void;

  /** An open referral for this patient to the selected hospital, if any. */
  referral?: Pick<Referral, 'id' | 'referralId'> & { statusLabel?: string };

  errors: BookingError[];
  result: BookingActionResult | null;
  isBooking: boolean;
  bookingError?: string;
  onBook: () => void;
  onResetBooking: () => void;

  bookings: BookingAppointment[];
  bookingsLoading: boolean;
  bookingsMessage?: string;

  reschedule: {
    appointmentId?: string;
    date: string;
    time: string;
    slots: SlotAvailability[];
    slotsLoading: boolean;
    message?: string;
    onOpen: (appointment: BookingAppointment) => void;
    onClose: () => void;
    onDateChange: (date: string) => void;
    onTimeChange: (time: string) => void;
    onSubmit: () => void;
    result: BookingActionResult | null;
  };

  cancel: {
    appointmentId?: string;
    reason: string;
    onOpen: (appointment: BookingAppointment) => void;
    onClose: () => void;
    onReasonChange: (reason: string) => void;
    onSubmit: () => void;
  };

  isMutating: boolean;
  actionResult: BookingActionResult | null;
}

// ── The workflow ──────────────────────────────────────────────────

export function BookAppointmentWorkflow(props: BookingWorkflowProps) {
  const { t, language } = useTranslation();
  const { lookup } = props;
  const patient = lookup.state === 'found' ? lookup.patient : null;

  const [code, setCode] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [showAllBookings, setShowAllBookings] = useState(false);

  const submitPatient = () => props.onPatientSearch(code);
  const clearPatient = () => {
    setCode('');
    props.onPatientReset();
  };

  const hospital = props.hospitals.find(item => item.id === props.hospitalId);
  const doctor = props.doctors.find(item => item.id === props.doctorId);
  const selectedSlot = props.slots.find(slot => slot.time === props.time);
  const canConfirm =
    !!patient &&
    !!hospital &&
    !!doctor &&
    !!props.date &&
    !!props.time &&
    !!selectedSlot?.available &&
    props.reason.trim().length > 0 &&
    !props.isBooking;

  const steps: { key: TranslationKey; done: boolean }[] = [
    { key: 'bookingStepPatient', done: !!patient },
    { key: 'bookingStepHospital', done: !!hospital },
    { key: 'bookingStepDoctor', done: !!doctor },
    { key: 'bookingStepSlot', done: !!props.date && !!selectedSlot?.available },
    { key: 'bookingStepConfirm', done: props.result?.ok === true },
  ];

  return (
    <div className="space-y-4" data-slot="book-appointment-panel">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Calendar className="h-5 w-5 text-primary" />
          {t('bookAppointmentForPatient')}
        </h2>
      </div>

      {/* Confirmation replaces the form: nothing is confirmed until the
          backend has stored the appointment. */}
      {props.result?.ok && props.result.appointment && patient ? (
        <Card className="border-emerald-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              {t('appointmentConfirmedTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4" data-slot="booking-confirmation">
            <p className="text-sm text-muted-foreground">{t('appointmentConfirmedBody')}</p>

            <div className="grid grid-cols-1 gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 sm:grid-cols-2">
              <ConfirmLine label={t('rolePatient')} value={`${patient.name} · ${patient.id}`} />
              <ConfirmLine label={t('healthCardId')} value={patient.healthCardId} />
              <ConfirmLine label={t('hospital')} value={props.result.appointment.facilityName ?? hospital?.name ?? ''} />
              <ConfirmLine label={t('doctor')} value={props.result.appointment.doctorName ?? doctor?.name ?? ''} />
              <ConfirmLine
                label={t('appointmentTime')}
                value={`${props.result.appointment.date} · ${props.result.appointment.time}`}
              />
              <ConfirmLine label={t('appointmentIdLabel')} value={props.result.appointment.appointmentId ?? props.result.appointment.id} />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('appointmentStatus')}</p>
                <div className="mt-1"><AppointmentStatusBadge appointment={props.result.appointment} /></div>
              </div>
              <ConfirmLine
                label={t('bookingSourceLabel')}
                value={props.result.appointment.bookingSource === 'HEALTH_WORKER'
                  ? t('bookingSourceHealthWorker')
                  : props.result.appointment.bookingSource ?? '—'}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowDetails(value => !value)}
              >
                {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showDetails ? t('hideAppointmentDetails') : t('viewAppointmentDetails')}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={props.onResetBooking}>
                <Calendar className="h-4 w-4" />
                {t('bookAnotherAppointment')}
              </Button>
            </div>

            {showDetails && (
              <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-xs">
                <p>
                  <span className="font-medium">{t('bookedByLabel')}: </span>
                  {props.result.appointment.bookedByName ?? '—'}
                </p>
                <p>
                  <span className="font-medium">{t('appointmentBookedOn')}: </span>
                  {formatAppointmentTime(props.result.appointment.createdAt)}
                </p>
                <p>
                  <span className="font-medium">{t('reasonLabel')}: </span>
                  {props.result.appointment.reason}
                </p>
                {props.result.appointment.referralId && (
                  <p>
                    <span className="font-medium">{t('referralStatusLabel')}: </span>
                    {props.referral?.referralId ?? props.result.appointment.referralId}
                  </p>
                )}
                {(props.result.appointment.history ?? []).map(entry => (
                  <p key={entry.id} className="text-muted-foreground">
                    {formatAppointmentTime(entry.at)} · {entry.byName} · {entry.action}
                  </p>
                ))}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              {t('myAppointments')} · {t('doctor')} · {t('hospital')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Step strip */}
          {props.bookingError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-semibold text-red-700">{t('bookingFailedTitle')}</p>
              <p className="mt-0.5 text-xs text-red-700">{props.bookingError}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            {steps.map((step, index) => (
              <span key={step.key} className="flex items-center gap-1.5">
                {index > 0 && <ArrowRight className="h-3 w-3 opacity-40" />}
                <span
                  className={`rounded-full border px-2 py-0.5 ${
                    step.done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border'
                  }`}
                >
                  {t(step.key)}
                </span>
              </span>
            ))}
          </div>

          {/* 1. Patient */}
          <Card data-slot="booking-step-patient">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                {t('findExistingPatient')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{t('bookAppointmentForPatientHint')}</p>
              {!patient ? (
                <>
                  <PatientLookupField
                    value={code}
                    onChange={setCode}
                    onSubmit={submitPatient}
                    isSearching={lookup.state === 'searching'}
                  />
                  <PatientLookupStatus lookup={lookup} />
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {t('bookingForPatient', { patient: patient.name })}
                    </p>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={clearPatient}>
                      <RefreshCw className="h-3.5 w-3.5" /> {t('changePatient')}
                    </Button>
                  </div>
                  <PatientVerificationCard
                    patient={patient}
                    canEdit={false}
                    accessSource={lookup.accessSource}
                    offline={lookup.offline}
                    counts={props.recordCounts(patient.id)}
                    onEdit={() => {}}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* 2. Hospital */}
          {patient && (
            <Card data-slot="booking-step-hospital">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-primary" />
                  {t('selectHospitalFacility')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('hospitalBookingHint')}</p>
                {props.hospitalsLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Spinner /> {t('loading')}
                  </div>
                ) : props.hospitals.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    {props.hospitalsMessage || t('noHospitalsAvailable')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {props.hospitals.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        data-slot="booking-hospital-option"
                        aria-pressed={props.hospitalId === item.id}
                        onClick={() => props.onSelectHospital(item.id)}
                        className={`w-full rounded-lg border p-3 text-left transition-all ${
                          props.hospitalId === item.id
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground break-words">{item.name}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {item.district || item.hospitalId || '—'}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <Badge variant="outline" className="text-[10px]">
                              {t(item.doctorCount === 1 ? 'doctorCountOne' : 'doctorCountMany', { count: item.doctorCount })}
                            </Badge>
                            {item.referralDestination && (
                              <p className="mt-1 text-[10px] text-primary">{t('referralDestination')}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 3. Doctor */}
          {patient && hospital && (
            <Card data-slot="booking-step-doctor">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  {t('selectDoctor')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {props.doctorsLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Spinner /> {t('loading')}
                  </div>
                ) : props.doctors.length === 0 ? (
                  <div className="space-y-2 py-3">
                    <p className="text-sm text-muted-foreground">
                      {props.doctorsMessage || t('noDoctorsInHospital')}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => props.onSelectHospital('')}>
                      {t('selectHospitalFacility')}
                    </Button>
                  </div>
                ) : (
                  props.doctors.map(item => (
                    <div
                      key={item.id}
                      data-slot="booking-doctor-option"
                      className={`rounded-lg border p-3 transition-all ${
                        props.doctorId === item.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border'
                      }`}
                    >
                      <button
                        type="button"
                        aria-pressed={props.doctorId === item.id}
                        className="w-full text-left"
                        onClick={() => props.onSelectDoctor(item.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground break-words">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.specialization}
                              {item.department && item.department !== item.specialization
                                ? ` · ${item.department}`
                                : ''}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {t('doctorAvailability', { days: formatDays(item.availableDays) })}
                            </p>
                          </div>
                          {typeof item.consultationFee === 'number' && (
                            <span className="shrink-0 text-xs text-muted-foreground">₹{item.consultationFee}</span>
                          )}
                        </div>
                      </button>

                      {props.doctorId === item.id && (
                        <div className="mt-2 border-t border-border pt-2">
                          <p className="text-[11px] font-medium text-foreground">{t('nextAvailableDates')}</p>
                          {item.nextAvailableDates.length === 0 ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">{t('noUpcomingDates')}</p>
                          ) : (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {item.nextAvailableDates.map((suggestion: string) => (
                                <button
                                  key={suggestion}
                                  type="button"
                                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                                    props.date === suggestion
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-border hover:bg-muted'
                                  }`}
                                  onClick={() => props.onDateChange(suggestion)}
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {/* 4. Date & time */}
          {patient && doctor && (
            <Card data-slot="booking-step-slot">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-4 w-4 text-primary" />
                  {t('selectDate')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  type="date"
                  value={props.date}
                  onChange={event => props.onDateChange(event.target.value)}
                  min={todayIso()}
                  className="h-11"
                  aria-label={t('selectDate')}
                />

                {props.date && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-foreground">
                      {t('availableSlotsFor', { date: props.date })}
                    </p>
                    {props.slotsLoading ? (
                      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                        <Spinner /> {t('loading')}
                      </div>
                    ) : !props.doctorAvailable ? (
                      <p className="text-sm text-muted-foreground">
                        {props.slotsMessage || t('doctorUnavailableOnDate')}
                      </p>
                    ) : props.slots.every(slot => !slot.available) ? (
                      <p className="text-sm text-muted-foreground">{t('noSlotsAvailable')}</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {props.slots.map(slot => (
                          <button
                            key={slot.time}
                            type="button"
                            data-slot="booking-slot"
                            disabled={!slot.available}
                            aria-pressed={props.time === slot.time}
                            aria-label={`${slot.time}${slot.available ? '' : ` ${t('slotBookedLabel')}`}`}
                            onClick={() => props.onTimeChange(slot.time)}
                            className={`flex h-11 flex-col items-center justify-center rounded-lg border text-xs font-medium transition-all ${
                              props.time === slot.time
                                ? 'border-primary bg-primary text-primary-foreground'
                                : slot.available
                                  ? 'border-border text-foreground hover:bg-muted'
                                  : 'cursor-not-allowed border-border bg-muted/60 text-muted-foreground line-through'
                            }`}
                          >
                            <span>{slot.time}</span>
                            {!slot.available && (
                              <span className="text-[9px] leading-none no-underline">{t('slotBookedLabel')}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 5. Reason + summary + confirm */}
          {patient && doctor && props.date && props.time && (
            <Card data-slot="booking-step-confirm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" />
                  {t('bookingSummary')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                  <SummaryLine label={t('rolePatient')} value={`${patient.name} · ${patient.id}`} />
                  <SummaryLine label={t('healthCardId')} value={patient.healthCardId} />
                  <SummaryLine label={t('hospital')} value={hospital?.name ?? '—'} />
                  <SummaryLine label={t('doctor')} value={doctor.name} />
                  <SummaryLine label={t('appointmentTime')} value={`${props.date} · ${props.time}`} />
                  <SummaryLine label={t('department')} value={doctor.department || doctor.specialization} />
                </div>

                {props.referral && (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">
                      {t('referralStatusLabel')}: {props.referral.referralId}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{props.referral.statusLabel ?? ''}</Badge>
                  </div>
                )}

                <div>
                  <label htmlFor="booking-reason" className="mb-1.5 block text-xs font-medium text-foreground">
                    {t('reasonForVisit')} *
                  </label>
                  <textarea
                    id="booking-reason"
                    value={props.reason}
                    onChange={event => props.onReasonChange(event.target.value)}
                    placeholder={t('reasonPlaceholder')}
                    maxLength={300}
                    className="h-20 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {props.reason.trim().length}/300
                  </p>
                </div>

                {props.errors.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3" data-slot="booking-errors">
                    {props.errors.map(error => (
                      <p key={`${error.code}-${error.field}`} className="flex items-start gap-1.5 text-xs text-red-700">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {errorLabel(error, t)}
                      </p>
                    ))}
                  </div>
                )}

                <Button
                  className="w-full h-11 gap-2"
                  disabled={!canConfirm}
                  onClick={props.onBook}
                >
                  {props.isBooking ? <Spinner /> : <CheckCircle2 className="h-4 w-4" />}
                  {props.isBooking ? t('loading') : t('confirmBooking')}
                </Button>
                {!canConfirm && !props.isBooking && (
                  <p className="text-[11px] text-muted-foreground">{t('errSelectSlot')}</p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Appointments this health worker booked */}
      <Card data-slot="booking-list">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-primary" />
            {t('myBookedAppointments')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {props.actionResult && (
            <p
              role="status"
              className={`rounded-lg border p-2 text-xs ${
                props.actionResult.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {props.actionResult.message}
            </p>
          )}

          {props.bookingsLoading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Spinner /> {t('loading')}
            </div>
          ) : props.bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{props.bookingsMessage || t('myBookedAppointmentsEmpty')}</p>
          ) : (
            (showAllBookings ? props.bookings : props.bookings.slice(0, 4)).map(appointment => {
              const rights = appointmentRights(appointment, {
                userId: appointment.bookedByUserId,
                role: 'health_worker',
              });
              const arrivalKey = appointmentArrivalLabelKey(appointment) as TranslationKey;
              const isRescheduling = props.reschedule.appointmentId === appointment.id;
              const isCancelling = props.cancel.appointmentId === appointment.id;

              return (
                <div key={appointment.id} className="rounded-xl border border-border p-3" data-slot="booking-row">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground break-words">
                        {appointment.patientName ?? appointment.patientId}
                        <span className="ml-1.5 text-[11px] text-muted-foreground">{appointment.patientId}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {appointment.doctorName ?? appointment.doctorId} · {appointment.facilityName ?? appointment.facilityId}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {appointment.date} · {appointment.time}
                        <span className="ml-2 text-[10px] uppercase tracking-wide">{appointment.appointmentId}</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <AppointmentStatusBadge appointment={appointment} />
                      <span className="text-[10px] text-muted-foreground">
                        {t('arrivalStatusLabel')}: {t(arrivalKey)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    {appointment.referralId && (
                      <Badge variant="outline" className="text-[10px]">
                        {t('referralStatusLabel')}: {appointment.referralStatus?.replace(/_/g, ' ') ?? appointment.referralId}
                      </Badge>
                    )}
                    {appointment.bookingSource === 'HEALTH_WORKER' && (
                      <Badge variant="outline" className="text-[10px]">{t('bookingSourceHealthWorker')}</Badge>
                    )}
                    <span>{t('bookedByLabel')}: {appointment.bookedByName ?? '—'}</span>
                  </div>

                  {rights.canCancel && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rights.canReschedule && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() =>
                            isRescheduling ? props.reschedule.onClose() : props.reschedule.onOpen(appointment)
                          }
                        >
                          {isRescheduling ? t('cancel') : t('reschedule')}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] text-red-600"
                        onClick={() => (isCancelling ? props.cancel.onClose() : props.cancel.onOpen(appointment))}
                      >
                        {isCancelling ? t('keepAppointment') : t('cancelAppointmentTitle')}
                      </Button>
                    </div>
                  )}

                  {isRescheduling && rights.canReschedule && (
                    <RescheduleForm
                      date={props.reschedule.date}
                      time={props.reschedule.time}
                      slots={props.reschedule.slots}
                      slotsLoading={props.reschedule.slotsLoading}
                      message={props.reschedule.message}
                      isMutating={props.isMutating}
                      onDateChange={props.reschedule.onDateChange}
                      onTimeChange={props.reschedule.onTimeChange}
                      onSubmit={props.reschedule.onSubmit}
                    />
                  )}

                  {isCancelling && rights.canCancel && (
                    <div className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
                      <label htmlFor={`cancel-reason-${appointment.id}`} className="text-[11px] font-medium text-foreground">
                        {t('cancelAppointmentReason')}
                      </label>
                      <textarea
                        id={`cancel-reason-${appointment.id}`}
                        value={props.cancel.reason}
                        onChange={event => props.cancel.onReasonChange(event.target.value)}
                        className="h-12 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs"
                          disabled={props.isMutating}
                          onClick={props.cancel.onSubmit}
                        >
                          {props.isMutating ? <Spinner /> : <X className="h-3.5 w-3.5" />}
                          {t('cancelAppointmentConfirm')}
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={props.cancel.onClose}>
                          {t('keepAppointment')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {props.bookings.length > 4 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowAllBookings(value => !value)}>
              {showAllBookings ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {t('viewDetails')}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConfirmLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-muted-foreground">
      <span className="font-medium text-foreground">{label}: </span>
      {value}
    </p>
  );
}

/** Reschedule editor: only genuinely free slots of the same doctor are offered. */
function RescheduleForm({
  date,
  time,
  slots,
  slotsLoading,
  message,
  isMutating,
  onDateChange,
  onTimeChange,
  onSubmit,
}: {
  date: string;
  time: string;
  slots: SlotAvailability[];
  slotsLoading: boolean;
  message?: string;
  isMutating: boolean;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const available = slots.some(slot => slot.available);
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        <Calendar className="h-3.5 w-3.5 text-primary" /> {t('rescheduleAppointmentTitle')}
      </p>
      <Input
        type="date"
        value={date}
        min={todayIso()}
        onChange={event => onDateChange(event.target.value)}
        className="h-9 text-xs"
        aria-label={t('selectDate')}
      />
      {slotsLoading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Spinner /> {t('loading')}</div>
      ) : !available ? (
        <p className="text-[11px] text-muted-foreground">{message || t('noSlotsAvailable')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {slots.map(slot => (
            <button
              key={slot.time}
              type="button"
              disabled={!slot.available}
              aria-pressed={time === slot.time}
              onClick={() => onTimeChange(slot.time)}
              className={`h-8 rounded-md border text-[11px] font-medium ${
                time === slot.time
                  ? 'border-primary bg-primary text-primary-foreground'
                  : slot.available
                    ? 'border-border bg-background hover:bg-muted'
                    : 'cursor-not-allowed border-border bg-muted/60 text-muted-foreground line-through'
              }`}
            >
              {slot.time}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="h-8 text-xs" disabled={!date || !time || isMutating} onClick={onSubmit}>
          {isMutating ? <Spinner /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {t('confirmBooking')}
        </Button>
      </div>
    </div>
  );
}

// ── Container ─────────────────────────────────────────────────────

/**
 * Wires the workflow to the backend: one patient lookup, the scoped hospital /
 * doctor / slot queries, and the create / reschedule / cancel mutations.
 */
export function BookAppointmentPanel({
  recordCounts,
}: {
  recordCounts: (patientId: string) => PatientRecordCounts;
}) {
  const { lookup, search, reset } = usePatientRegistry();
  const { referrals, appointments } = useData();
  const patient = lookup.state === 'found' ? lookup.patient : null;

  const [hospitalId, setHospitalId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<BookingError[]>([]);
  const [result, setResult] = useState<BookingActionResult | null>(null);
  const [bookingError, setBookingError] = useState<string | undefined>();
  const guard = useSubmitGuard();

  const [rescheduleTarget, setRescheduleTarget] = useState<BookingAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [cancelTarget, setCancelTarget] = useState<BookingAppointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionResult, setActionResult] = useState<BookingActionResult | null>(null);

  const hospitals = useBookingHospitals(patient?.id);
  const doctors = useHospitalDoctors(hospitalId || undefined, patient?.id);
  const slots = useAppointmentSlots({
    patientId: patient?.id,
    hospitalId: hospitalId || undefined,
    doctorId: doctorId || undefined,
    date: date || undefined,
  });
  const bookings = useMyBookedAppointments();
  const actions = useAppointmentBookingActions();

  const rescheduleSlots = useAppointmentSlots({
    patientId: rescheduleTarget?.patientId,
    hospitalId: rescheduleTarget?.facilityId,
    doctorId: rescheduleTarget?.doctorId,
    date: rescheduleDate || undefined,
  });

  // An open referral for this patient to the selected hospital is linked
  // automatically; the appointment never advances it.
  const referral = useMemo(() => {
    if (!patient || !hospitalId) return undefined;
    const match = referrals.find(
      item =>
        item.patientId === patient.id &&
        item.destinationFacilityId === hospitalId &&
        item.status !== 'closed' &&
        item.status !== 'cancelled',
    );
    return match
      ? { id: match.id, referralId: match.referralId, statusLabel: match.status.replace(/_/g, ' ') }
      : undefined;
  }, [patient, hospitalId, referrals]);

  const doctor = doctors.doctors.find(item => item.id === doctorId);

  const resetSelection = () => {
    setHospitalId('');
    setDoctorId('');
    setDate('');
    setTime('');
    setReason('');
    setErrors([]);
    setBookingError(undefined);
    setResult(null);
  };

  const handleSelectHospital = (id: string) => {
    setHospitalId(id);
    setDoctorId('');
    setDate('');
    setTime('');
    setResult(null);
    setErrors([]);
    setBookingError(undefined);
  };

  const handleSelectDoctor = (id: string) => {
    setDoctorId(id);
    setDate('');
    setTime('');
    setErrors([]);
    setBookingError(undefined);
  };

  const handleDateChange = (next: string) => {
    setDate(next);
    setTime('');
    setErrors([]);
  };

  const handleBook = async () => {
    if (!patient || !doctor || !guard()) return;

    const clientErrors = validateBookingRequest({
      patient: { id: patient.id },
      hospital: hospitalId ? { id: hospitalId, status: 'active' } : null,
      doctor: doctor ? { id: doctor.id, facilityId: hospitalId, availableDays: doctor.availableDays } : null,
      date,
      time,
      reason,
      appointments,
    }).filter(error => error.code !== 'slot_taken');
    // Slot availability is the SERVER's answer, not a client guess.
    const chosen = slots.slots.find(slot => slot.time === time);
    if (!chosen?.available) {
      clientErrors.push({ code: 'slot_taken', field: 'time', message: 'That slot is already booked.' });
    }
    if (clientErrors.length > 0) {
      setErrors(clientErrors);
      return;
    }

    setErrors([]);
    setBookingError(undefined);
    setResult(null);
    const response = await actions.book({
      patientId: patient.id,
      hospitalId,
      doctorId,
      date,
      time,
      reason,
      referralId: referral?.id,
      idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    if (response.ok && response.appointment) {
      setResult(response);
      setTime('');
      setReason('');
    } else {
      setResult(null);
      setBookingError(response.message);
      if (response.errors) setErrors(response.errors);
    }
  };

  const openReschedule = (appointment: BookingAppointment) => {
    setCancelTarget(null);
    setActionResult(null);
    setRescheduleTarget(appointment);
    setRescheduleDate('');
    setRescheduleTime('');
  };

  const submitReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) return;
    const response = await actions.reschedule({
      appointmentId: rescheduleTarget.id,
      date: rescheduleDate,
      time: rescheduleTime,
      reason: undefined,
    });
    setActionResult(response);
    if (response.ok) {
      setRescheduleTarget(null);
      setRescheduleDate('');
      setRescheduleTime('');
    }
  };

  const submitCancel = async () => {
    if (!cancelTarget) return;
    const response = await actions.cancel({ appointmentId: cancelTarget.id, reason: cancelReason });
    setActionResult(response);
    if (response.ok) {
      setCancelTarget(null);
      setCancelReason('');
    }
  };

  return (
    <BookAppointmentWorkflow
      lookup={lookup}
      recordCounts={recordCounts}
      onPatientSearch={code => {
        resetSelection();
        search(code);
      }}
      onPatientReset={() => {
        reset();
        resetSelection();
      }}
      hospitals={hospitals.hospitals}
      hospitalsLoading={hospitals.loading}
      hospitalsMessage={hospitals.message}
      hospitalId={hospitalId}
      onSelectHospital={handleSelectHospital}
      doctors={doctors.doctors}
      doctorsLoading={doctors.loading}
      doctorsMessage={doctors.message}
      doctorId={doctorId}
      onSelectDoctor={handleSelectDoctor}
      date={date}
      onDateChange={handleDateChange}
      slots={slots.slots}
      slotsLoading={slots.loading}
      slotsMessage={slots.message}
      doctorAvailable={slots.doctorAvailable}
      availableDates={slots.availableDates}
      time={time}
      onTimeChange={setTime}
      reason={reason}
      onReasonChange={value => {
        setReason(value);
        setErrors(prev => prev.filter(error => error.field !== 'reason'));
      }}
      referral={referral}
      errors={errors}
      result={result}
      isBooking={actions.isBooking}
      bookingError={bookingError}
      onBook={handleBook}
      onResetBooking={resetSelection}
      bookings={bookings.appointments}
      bookingsLoading={bookings.loading}
      bookingsMessage={bookings.message}
      reschedule={{
        appointmentId: rescheduleTarget?.id,
        date: rescheduleDate,
        time: rescheduleTime,
        slots: rescheduleSlots.slots,
        slotsLoading: rescheduleSlots.loading,
        message: rescheduleSlots.message,
        onOpen: openReschedule,
        onClose: () => setRescheduleTarget(null),
        onDateChange: value => {
          setRescheduleDate(value);
          setRescheduleTime('');
        },
        onTimeChange: setRescheduleTime,
        onSubmit: submitReschedule,
        result: actionResult,
      }}
      cancel={{
        appointmentId: cancelTarget?.id,
        reason: cancelReason,
        onOpen: appointment => {
          setRescheduleTarget(null);
          setActionResult(null);
          setCancelTarget(appointment);
          setCancelReason('');
        },
        onClose: () => setCancelTarget(null),
        onReasonChange: setCancelReason,
        onSubmit: submitCancel,
      }}
      isMutating={actions.isMutating}
      actionResult={actionResult}
    />
  );
}

