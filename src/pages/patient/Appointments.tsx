// ============================================================================
// Patient Appointments
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
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
  const { appointments, facilities } = useData();
  const { language } = useApp();
  const patientAppointments = appointments.filter(a => a.patientId === 'p1');
  const upcoming = patientAppointments.filter(a => a.status === 'scheduled');
  const past = patientAppointments.filter(a => a.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            {t('myAppointments', language)}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {language === 'ta' ? 'உங்கள் சந்திப்புகளை நிர்வகிக்கவும்' :
             language === 'hi' ? 'अपनी अपॉइंटमेंट प्रबंधित करें' :
             'Manage your upcoming and past appointments'}
          </p>
        </div>
        <Link to="/patient/book-appointment">
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t('bookAppointment', language)}
          </Button>
        </Link>
      </div>

      {/* Upcoming */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          {language === 'ta' ? 'வரவிருக்கும்' : language === 'hi' ? 'आगामी' : 'Upcoming'} ({upcoming.length})
        </h3>
        <div className="space-y-3">
          {upcoming.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No upcoming appointments
              </CardContent>
            </Card>
          ) : (
            upcoming.map(apt => {
              const facility = facilities.find(f => f.id === apt.facilityId);
              return (
                <Card key={apt.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-foreground">{apt.department}</h4>
                          <Badge className={`text-[10px] ${STATUS_COLORS[apt.status]}`}>
                            {apt.status}
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
          {language === 'ta' ? 'கடந்த' : language === 'hi' ? 'पिछली' : 'Past'} ({past.length})
        </h3>
        <div className="space-y-3">
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
                      Completed
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
