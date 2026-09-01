// ============================================================================
// Health Worker Dashboard
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { patients, referrals, followups, healthWorkers, notifications } from '@/lib/mock-data';
import { Link } from 'react-router';
import {
  Users, AlertTriangle, FileText, Clock, UserPlus, Stethoscope,
  Wifi, ChevronRight, Bell, Activity, WifiOff, CloudOff, ClipboardList
} from 'lucide-react';

export default function HWDashboard() {
  const { language, isOffline } = useApp();
  const hw = healthWorkers[0]; // Suganthi M

  const highRiskPatients = patients.filter(p =>
    p.chronicConditions && p.chronicConditions.length > 0
  ).slice(0, 3);

  const pendingReferrals = referrals.filter(r =>
    r.status !== 'closed' && r.status !== 'followup'
  );

  const missedFollowups = followups.filter(f => f.status === 'missed' || f.status === 'overdue');
  const dueFollowups = followups.filter(f => f.status === 'scheduled');

  const unreadNotifs = notifications.filter(n => n.userId === hw.userId && !n.read);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'ta' ? 'வணக்கம்' : language === 'hi' ? 'नमस्ते' : 'Hello'}, {hw.name} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Health Worker • {hw.area} • {hw.patientsAssigned} patients assigned
          </p>
        </div>
        {/* Offline status */}
        <div className="flex items-center gap-2">
          {isOffline ? (
            <Badge className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
              <WifiOff className="h-3 w-3" /> Offline
            </Badge>
          ) : (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
              <Wifi className="h-3 w-3" /> Synced
            </Badge>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{hw.patientsAssigned}</p>
                <p className="text-xs text-muted-foreground">{t('todayPatients', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{highRiskPatients.length}</p>
                <p className="text-xs text-muted-foreground">{t('highRiskCases', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingReferrals.length}</p>
                <p className="text-xs text-muted-foreground">{t('pendingReferrals', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{missedFollowups.length}</p>
                <p className="text-xs text-muted-foreground">{t('missedFollowups', language)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: t('registerPatient', language), path: '/hw/register', icon: UserPlus, color: 'bg-primary/10 text-primary' },
          { label: t('aiAssistant', language), path: '/hw/ai-triage', icon: Stethoscope, color: 'bg-emerald-50 text-emerald-600' },
          { label: t('createReferral', language), path: '/hw/create-referral', icon: FileText, color: 'bg-violet-50 text-violet-600' },
          { label: t('qrReferral', language), path: '/hw/referrals', icon: ClipboardList, color: 'bg-amber-50 text-amber-600' },
          { label: t('offlineCapture', language), path: '/hw/sync', icon: isOffline ? CloudOff : Wifi, color: isOffline ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600' },
          { label: t('followUpReminders', language), path: '/hw/followups', icon: Bell, color: 'bg-red-50 text-red-600' },
        ].map(action => {
          const Icon = action.icon;
          return (
            <Link key={action.path} to={action.path}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`h-10 w-10 rounded-xl ${action.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{action.label}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* High Risk Cases */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-[1.125rem] w-[1.125rem] text-red-500" />
              {t('highRiskCases', language)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {highRiskPatients.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">Age {p.age} • {p.village}</p>
                  </div>
                </div>
                <RiskBadge level={p.chronicConditions && p.chronicConditions.length > 1 ? 'high' : 'medium'} size="sm" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Pending Referrals */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-[1.125rem] w-[1.125rem] text-primary" />
                {t('pendingReferrals', language)}
              </CardTitle>
              <Link to="/hw/referrals">
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                  View all <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingReferrals.slice(0, 4).map(ref => (
              <div key={ref.id} className="p-3 rounded-lg border border-border">
                <div className="flex items-start justify-between mb-1.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{ref.patientName}</p>
                    <p className="text-xs text-muted-foreground">{ref.referralId} • {ref.department}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">{ref.status.replace(/_/g, ' ')}</Badge>
                </div>
                <ReferralProgressMini currentStep={ref.currentStep} totalSteps={ref.totalSteps} isOverdue={ref.isOverdue} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Notifications */}
      {unreadNotifs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('notifications', language)}
              <Badge className="h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center">{unreadNotifs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unreadNotifs.map(n => (
              <div key={n.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${
                  n.type === 'alert' ? 'bg-red-500' : n.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                }`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
