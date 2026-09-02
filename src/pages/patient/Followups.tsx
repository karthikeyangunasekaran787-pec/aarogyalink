// ============================================================================
// Follow-up Reminders
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';
import { Bell, Calendar, Clock, AlertTriangle, CheckCircle2, User } from 'lucide-react';

const STATUS_CONFIG = {
  scheduled: { icon: Calendar, color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Scheduled' },
  completed: { icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Completed' },
  missed: { icon: AlertTriangle, color: 'bg-red-50 text-red-700 border-red-200', label: 'Missed' },
  overdue: { icon: AlertTriangle, color: 'bg-red-50 text-red-700 border-red-200', label: 'Overdue' },
  rescheduled: { icon: Calendar, color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Rescheduled' },
};

export default function Followups() {
  const { followups } = useData();
  const { language, currentUser } = useApp();
  const patientFollowups = followups.filter(f => f.patientId === currentUser?.patientId);
  const upcoming = patientFollowups.filter(f => f.status === 'scheduled');
  const past = patientFollowups.filter(f => f.status !== 'scheduled');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          {t('followUpReminders', language)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track and manage your follow-up appointments
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Upcoming ({upcoming.length})</h3>
        <div className="space-y-3">
          {upcoming.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No upcoming follow-ups</CardContent></Card>
          ) : upcoming.map(f => {
            const config = STATUS_CONFIG[f.status];
            const Icon = config.icon;
            return (
              <Card key={f.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{f.reason}</h4>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <User className="h-3 w-3" />{f.doctorName} • {f.facilityName}
                      </p>
                    </div>
                    <Badge className={`text-[10px] ${config.color}`}><Icon className="h-3 w-3 mr-0.5" />{config.label}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{f.scheduledDate}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{f.scheduledTime}</span>
                  </div>
                  {f.missedFollowupRisk !== undefined && f.missedFollowupRisk > 40 && (
                    <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      <span>AI predicts {f.missedFollowupRisk}% risk of missing this follow-up</span>
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="mt-3 h-8 text-xs">Reschedule</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Past ({past.length})</h3>
          <div className="space-y-3">
            {past.map(f => {
              const config = STATUS_CONFIG[f.status] || STATUS_CONFIG.scheduled;
              return (
                <Card key={f.id} className="opacity-70">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-foreground">{f.reason}</h4>
                        <p className="text-xs text-muted-foreground">{f.doctorName} • {f.scheduledDate}</p>
                      </div>
                      <Badge className={`text-[10px] ${config.color}`}>{config.label}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
