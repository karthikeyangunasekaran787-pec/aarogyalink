// ============================================================================
// Patient Appointments
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/contexts/DataContext';
import { Calendar, Clock, MapPin, Plus } from 'lucide-react';
import { Link } from 'react-router';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  confirmed: 'bg-green-50 text-green-700 border-green-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
  missed: 'bg-red-50 text-red-700 border-red-200',
};

export default function Appointments() {
  const { appointments, facilities, hospitals } = useData();
  const { t } = useTranslation();
  const { currentUser } = useApp();
  const patientAppointments = appointments.filter(a => a.patientId === currentUser?.patientId);
  const upcoming = patientAppointments.filter(a => a.status === 'scheduled');
  const past = patientAppointments.filter(a => a.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            {t('myAppointments')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('appointmentsSubtitle')}</p>
        </div>
        <Link to="/patient/book-appointment">
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t('bookAppointment')}
          </Button>
        </Link>
      </div>

      {/* Upcoming */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          {t('upcoming')} ({upcoming.length})
        </h3>
        <div className="space-y-3">
          {upcoming.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm font-medium text-foreground">{t('noAppointmentsYet')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('noAppointmentsHint')}</p>
              </CardContent>
            </Card>
          ) : (
            upcoming.map(apt => {
              // Appointments can be booked at hospitals (h*) or facilities (f*)
              const facility = facilities.find(f => f.id === apt.facilityId)
                ?? hospitals.find(h => h.id === apt.facilityId);
              return (
                <Card key={apt.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-foreground">{apt.department}</h4>
                          <Badge className={`text-[10px] ${STATUS_COLORS[apt.status]}`}>
                            {t('scheduled')}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{apt.reason}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-primary">{apt.date}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end mt-0.5">
                          <Clock className="h-3 w-3" /> {apt.time}
                        </p>
                      </div>
                    </div>
                    {facility && (
                      <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span>{facility.name}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Past */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          {t('past')} ({past.length})
        </h3>
        <div className="space-y-3">
          {past.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {t('noAppointmentsPast')}
              </CardContent>
            </Card>
          )}
          {past.map(apt => (
            <Card key={apt.id} className="opacity-70">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-foreground">{apt.department}</h4>
                    <p className="text-xs text-muted-foreground">{apt.reason}</p>
                  </div>
                  <div className="text-right">
                    <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                      {t('completed')}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{apt.date}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
