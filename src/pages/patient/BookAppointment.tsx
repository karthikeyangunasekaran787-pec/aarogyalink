// ============================================================================
// Book Appointment Page
// ============================================================================

import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTranslation } from '@/hooks/use-translation';
import { useSubmitGuard } from '@/hooks/use-submit-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/contexts/DataContext';
import { Calendar, Clock, MapPin, CheckCircle2, ArrowRight, User, Building2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { bookingLocations, type CareDestination } from '@/lib/care-destinations';
import type { Facility, Hospital } from '@/types';

const TIME_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30'];

/**
 * Doctors are linked to HOSPITAL ids (h1, h2, ...), while the patient-facing
 * facility finder uses FACILITY ids (f1, f2, ...). Both kinds are offered, but
 * only where a doctor actually practises — otherwise the doctor list would be
 * empty and the booking would be a dead end. The hospital directory spans every
 * district, so a patient can book at any hospital in the platform.
 */
interface BookingLocation {
  id: string;
  name: string;
  area: string;
  kind: 'facility' | 'hospital';
  careMatchScore?: number;
  doctorCount: number;
  phone: string;
}

function toBookingLocations(
  destinations: CareDestination[],
  facilities: Facility[],
  hospitals: Hospital[],
): BookingLocation[] {
  const facilityById = new Map(facilities.map(f => [f.id, f]));
  const hospitalById = new Map(hospitals.map(h => [h.id, h]));
  return destinations.map(d => {
    const facility = facilityById.get(d.id);
    const hospital = hospitalById.get(d.id);
    return {
      id: d.id,
      name: d.name,
      area: d.district || facility?.village || '',
      kind: d.kind,
      careMatchScore: facility?.careMatchScore,
      doctorCount: d.doctorCount,
      phone: facility?.phone || hospital?.phone || '',
    };
  });
}

export default function BookAppointment() {
  const { currentUser } = useApp();
  const { t } = useTranslation();
  const { facilities, hospitals, doctors, bookAppointment, addNotification } = useData();
  // One booking per press: a fast double-click must not schedule two visits.
  const guardBook = useSubmitGuard();
  const locations = useMemo(
    () => toBookingLocations(bookingLocations(facilities, hospitals, doctors), facilities, hospitals),
    [facilities, hospitals, doctors],
  );
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedFacility = searchParams.get('facility') || '';
  const preselectedDoctor = searchParams.get('doctor') || '';

  // Deep links from the facility finder may pass a doctor whose home is a
  // HOSPITAL (h*) rather than the facility (f*) in the URL — resolve the
  // location from the doctor record so the pair is always consistent.
  const preselectedDoctorRecord = doctors.find(d => d.id === preselectedDoctor);
  const initialLocation = preselectedDoctorRecord
    ? preselectedDoctorRecord.facilityId
    : preselectedFacility;

  const [step, setStep] = useState<'select' | 'datetime' | 'confirm' | 'success'>('select');
  const [selectedFacility, setSelectedFacility] = useState(initialLocation);
  const [selectedDoctor, setSelectedDoctor] = useState(preselectedDoctor);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [reason, setReason] = useState('');
  // Reference shown on the confirmation screen. It is created once, when the
  // booking is made — deriving it during render would change it on every
  // re-render and hand the patient two different reference numbers.
  const [bookingRef, setBookingRef] = useState('');

  // A deep link from the facility finder may point at a location that is not in
  // the bookable list (e.g. a facility with no doctor, or one that no longer
  // exists). Treat that as "nothing selected" so the screen can never show a
  // highlighted location the patient cannot actually book at.
  const selectedLocationId = locations.some(l => l.id === selectedFacility) ? selectedFacility : '';

  const filteredDoctors = selectedLocationId
    ? doctors.filter(d => d.facilityId === selectedLocationId)
    : doctors;

  const location = locations.find(l => l.id === selectedLocationId);
  // The doctor must belong to the selected location: a stale deep link cannot
  // book one hospital's doctor at another hospital.
  const doctor = selectedLocationId
    ? doctors.find(d => d.id === selectedDoctor && d.facilityId === selectedLocationId)
    : undefined;

  const handleBook = () => {
    if (!doctor || !location) return;
    // Never book against another patient's record if this account is unlinked.
    const patientId = currentUser?.patientId;
    if (!patientId) return;
    if (!guardBook()) return;
    setBookingRef(`APT-${Date.now().toString().slice(-6)}`);
    bookAppointment({
      patientId,
      doctorId: doctor.id,
      facilityId: location.id,
      department: doctor.specialization,
      date: selectedDate,
      time: selectedTime,
      status: 'scheduled',
      reason: reason || t('generalConsultation'),
    });
    addNotification({
      userId: `u-${patientId}`,
      title: t('appointmentNotificationTitle'),
      message: t('appointmentNotificationBody', {
        doctor: doctor.name,
        facility: location.name,
        date: selectedDate,
        time: selectedTime,
      }),
      type: 'success',
      read: false,
    });
    setStep('success');
  };

  // Success state
  if (step === 'success') {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <Card className="border-emerald-200">
          <CardContent className="py-12 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground">{t('appointmentBooked')}</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {t('appointmentBookedBody', { doctor: doctor?.name ?? '', facility: location?.name ?? '' })}
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground mt-2">
              <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{selectedDate}</span>
              <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{selectedTime}</span>
            </div>
            <Badge variant="outline" className="text-xs mt-2">{bookingRef}</Badge>
            <div className="flex flex-wrap gap-3 justify-center mt-6">
              <Button variant="outline" onClick={() => navigate('/patient/appointments')}>{t('viewMyAppointments')}</Button>
              <Button onClick={() => navigate('/patient/dashboard')}>{t('backToHome')}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" />
          {t('bookAppointment')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('bookingSubtitle')}</p>
      </div>

      {/* Step 1: Select facility & doctor */}
      {step === 'select' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('selectHospitalFacility')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {locations.map(l => (
                <button
                  key={l.id}
                  className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                    selectedLocationId === l.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50'
                  }`}
                  onClick={() => { setSelectedFacility(l.id); setSelectedDoctor(''); }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground break-words">{l.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        {l.kind === 'hospital' ? <Building2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                        {l.area}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <Badge variant="outline" className="text-[10px]">
                        {l.kind === 'hospital' ? t('hospitalKind') : t('facilityKind')}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {l.careMatchScore
                          ? t('readinessScore', { score: l.careMatchScore })
                          : t(l.doctorCount === 1 ? 'doctorCountOne' : 'doctorCountMany', { count: l.doctorCount })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedLocationId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('selectDoctor')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filteredDoctors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('noDoctorsAvailable')}</p>
                ) : filteredDoctors.map(d => (
                  <button
                    key={d.id}
                    className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                      selectedDoctor === d.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedDoctor(d.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {d.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground break-words">{d.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.specialization} · {t('yearsExperience', { years: d.experience })}
                          </p>
                        </div>
                      </div>
                      {/* Fees and ratings are amounts, not sentences — they stay as they are. */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground">₹{d.consultationFee}</p>
                        <p className="text-[10px] text-muted-foreground">★ {d.rating}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {selectedLocationId && selectedDoctor && (
            <Button className="w-full h-11" onClick={() => setStep('datetime')}>
              {t('continueLabel')} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* Step 2: Select date & time */}
      {step === 'datetime' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('selectDate')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="h-11"
                aria-label={t('selectDate')}
              />
            </CardContent>
          </Card>

          {selectedDate && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('selectTimeSlot')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {TIME_SLOTS.map(slot => (
                    <button
                      key={slot}
                      className={`h-10 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                        selectedTime === slot
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:bg-muted text-foreground'
                      }`}
                      onClick={() => setSelectedTime(slot)}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('reasonForVisit')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t('reasonPlaceholder')}
                className="h-11"
              />
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-11" onClick={() => setStep('select')}>{t('back')}</Button>
            <Button
              className="flex-1 h-11"
              disabled={!selectedDate || !selectedTime}
              onClick={() => setStep('confirm')}
            >
              {t('reviewBooking')} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('confirmAppointment')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{doctor?.name}</p>
                  <p className="text-xs text-muted-foreground">{doctor?.specialization}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{location?.name}</p>
                  <p className="text-xs text-muted-foreground">{location?.area}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <p className="text-sm font-medium">
                  {t('atTime', { date: selectedDate, time: selectedTime })}
                </p>
              </div>
              {reason && (
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-0.5">{t('reasonLabel')}</p>
                  <p className="text-sm">{reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-11" onClick={() => setStep('datetime')}>{t('back')}</Button>
            <Button className="flex-1 h-11" disabled={!doctor || !location} onClick={handleBook}>
              {t('confirmBooking')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
