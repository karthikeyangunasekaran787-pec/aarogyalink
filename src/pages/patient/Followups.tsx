// ============================================================================
// Follow-up Reminders
// ============================================================================

import { useNavigate } from 'react-router';
import { useApp } from '@/contexts/AppContext';
import { useTranslation } from '@/hooks/use-translation';
import type { TranslationKey } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';
import { Bell, Calendar, Clock, AlertTriangle, CheckCircle2, User } from 'lucide-react';

const STATUS_CONFIG = {
  scheduled: { icon: Calendar, color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'scheduled' },
  completed: { icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'completed' },
  missed: { icon: AlertTriangle, color: 'bg-red-50 text-red-700 border-red-200', label: 'missed' },
  overdue: { icon: AlertTriangle, color: 'bg-red-50 text-red-700 border-red-200', label: 'overdueLabel' },
  rescheduled: { icon: Calendar, color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'rescheduled' },
} satisfies Record<string, { icon: typeof Calendar; color: string; label: TranslationKey }>;

export default function Followups() {
  const { followups } = useData();
  const { currentUser } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const patientFollowups = followups.filter(f => f.patientId === currentUser?.patientId);
  const upcoming = patientFollowups.filter(f => f.status === 'scheduled');
  const past = patientFollowups.filter(f => f.status !== 'scheduled');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          {t('followUpReminders')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('followupsSubtitle')}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('upcomingCount', { count: upcoming.length })}</h3>
        <div className="space-y-3">
          {upcoming.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <Bell className="h-9 w-9 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{t('noUpcomingFollowups')}</p>
              </CardContent>
            </Card>
          ) : upcoming.map(f => {
            const config = STATUS_CONFIG[f.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.scheduled;
            const Icon = config.icon;
            return (
              <Card key={f.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-foreground break-words">{f.reason}</h4>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 flex-wrap">
                        <User className="h-3 w-3" />{f.doctorName} • {f.facilityName}
                      </p>
                    </div>
                    <Badge className={`text-[10px] flex-shrink-0 ${config.color}`}>
                      <Icon className="h-3 w-3 mr-0.5" />{t(config.label)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{f.scheduledDate}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{f.scheduledTime}</span>
                  </div>
                  {f.missedFollowupRisk !== undefined && f.missedFollowupRisk > 40 && (
                    <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{t('flaggedReminderCall', { risk: f.missedFollowupRisk })}</span>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-8 text-xs"
                    title={t('rescheduleHint')}
                    onClick={() => navigate(`/patient/book-appointment?doctor=${f.doctorId}`)}
                  >
                    {t('reschedule')}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('pastCount', { count: past.length })}</h3>
          <div className="space-y-3">
            {past.map(f => {
              const config = STATUS_CONFIG[f.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.scheduled;
              return (
                <Card key={f.id} className="opacity-70">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-medium text-foreground break-words">{f.reason}</h4>
                        <p className="text-xs text-muted-foreground">{f.doctorName} • {f.scheduledDate}</p>
                      </div>
                      <Badge className={`text-[10px] flex-shrink-0 ${config.color}`}>{t(config.label)}</Badge>
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
