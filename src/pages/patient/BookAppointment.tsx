// ============================================================================
// Book Appointment Page
// ============================================================================

import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/contexts/DataContext';
import { Calendar, Clock, MapPin, CheckCircle2, ArrowRight, User, Building2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Facility, Hospital } from '@/types';

const TIME_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30'];

/**
 * Doctors are linked to HOSPITAL ids (h1, h2, ...), while the patient-facing
 * facility finder uses FACILITY ids (f1, f2, ...). Booking must therefore
 * offer both hospital and facility locations — otherwise doctors at h1–h5
 * never match a facility filter and the doctor list shows up empty.
 */
interface BookingLocation {
  id: string;
  name: string;
  area: string;
  kind: 'facility' | 'hospital';
  careMatchScore?: number;
  phone: string;
}

function toBookingLocations(facilities: Facility[], hospitals: Hospital[]): BookingLocation[] {
  const locations: BookingLocation[] = facilities.map(f => ({
    id: f.id,
    name: f.name,
    area: f.village,
    kind: 'facility' as const,
    careMatchScore: f.careMatchScore,
    phone: f.phone,
  }));
  const seen = new Set(locations.map(l => l.id));
  for (const h of hospitals) {
    if (!seen.has(h.id) && h.status === 'active') {
      locations.push({
        id: h.id,
        name: h.name,
        area: h.district,
        kind: 'hospital' as const,
        phone: h.phone,
      });
    }
  }
  return locations;
}

export default function BookAppointment() {
  const { language, currentUser } = useApp();
  const { facilities, hospitals, doctors, bookAppointment, addNotification } = useData();
  const locations = useMemo(() => toBookingLocations(facilities, hospitals), [facilities, hospitals]);
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

  const filteredDoctors = selectedFacility
    ? doctors.filter(d => d.facilityId === selectedFacility)
    : doctors;

  const location = locations.find(l => l.id === selectedFacility);
  const doctor = doctors.find(d => d.id === selectedDoctor);

  const handleBook = () => {
    if (!doctor || !location) return;
    const patientId = currentUser?.patientId || 'p1';
    bookAppointment({
      patientId,
      doctorId: doctor.id,
      facilityId: location.id,
      department: doctor.specialization,
      date: selectedDate,
      time: selectedTime,
      status: 'scheduled',
      reason: reason || 'General consultation',
    });
    addNotification({
      userId: `u-${patientId}`,
      title: 'Appointment Booked',
      message: `Your appointment with ${doctor.name} at ${location.name} on ${selectedDate} at ${selectedTime} is scheduled.`,
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
            <h2 className="text-xl font-bold text-foreground">Appointment Booked</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Your appointment with {doctor?.name} at {location?.name} has been confirmed.
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground mt-2">
              <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{selectedDate}</span>
              <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{selectedTime}</span>
            </div>
            <Badge variant="outline" className="text-xs mt-2">APT-{Date.now().toString().slice(-6)}</Badge>
            <div className="flex gap-3 justify-center mt-6">
              <Button variant="outline" onClick={() => navigate('/patient/appointments')}>View My Appointments</Button>
              <Button onClick={() => navigate('/patient/dashboard')}>Back to Home</Button>
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
          {t('bookAppointment', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a hospital or facility, doctor, and preferred time slot
        </p>
      </div>

      {/* Step 1: Select facility & doctor */}
      {step === 'select' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Select Hospital / Facility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {locations.map(l => (
                <button
                  key={l.id}
                  className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                    selectedFacility === l.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50'
                  }`}
                  onClick={() => { setSelectedFacility(l.id); setSelectedDoctor(''); }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{l.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        {l.kind === 'hospital' ? <Building2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                        {l.area}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {l.kind === 'hospital' ? 'Hospital' : `Score ${l.careMatchScore ?? '—'}`}
                    </Badge>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedFacility && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Select Doctor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filteredDoctors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No doctors available at this hospital yet</p>
                ) : filteredDoctors.map(d => (
                  <button
                    key={d.id}
                    className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                      selectedDoctor === d.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedDoctor(d.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {d.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{d.name}</p>
                          <p className="text-xs text-muted-foreground">{d.specialization} · {d.experience}yr exp</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">₹{d.consultationFee}</p>
                        <p className="text-[10px] text-muted-foreground">★ {d.rating}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {selectedFacility && selectedDoctor && (
            <Button className="w-full h-11" onClick={() => setStep('datetime')}>
              Continue <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* Step 2: Select date & time */}
      {step === 'datetime' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Select Date</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="h-11"
              />
            </CardContent>
          </Card>

          {selectedDate && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Select Time Slot</CardTitle>
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
              <CardTitle className="text-base">Reason for Visit</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Follow-up consultation"
                className="h-11"
              />
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-11" onClick={() => setStep('select')}>Back</Button>
            <Button
              className="flex-1 h-11"
              disabled={!selectedDate || !selectedTime}
              onClick={() => setStep('confirm')}
            >
              Review Booking <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Confirm Appointment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{doctor?.name}</p>
                  <p className="text-xs text-muted-foreground">{doctor?.specialization}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{location?.name}</p>
                  <p className="text-xs text-muted-foreground">{location?.area}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium">{selectedDate} at {selectedTime}</p>
              </div>
              {reason && (
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-0.5">Reason</p>
                  <p className="text-sm">{reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-11" onClick={() => setStep('datetime')}>Back</Button>
            <Button className="flex-1 h-11" onClick={handleBook}>Confirm Booking</Button>
          </div>
        </div>
      )}
    </div>
  );
}
