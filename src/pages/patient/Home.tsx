// ============================================================================
// Patient Home Dashboard
// ============================================================================

import { useApp } from '@/contexts/AppContext';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReferralProgressMini } from '@/components/shared/ReferralTimeline';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { patients, referrals, appointments, followups, notifications, facilities } from '@/lib/mock-data';
import { Link } from 'react-router';
import {
  Stethoscope, MapPin, Calendar, FileText, CreditCard, Clock,
  Bell, Pill, TestTube, Phone, Shield, Activity, ChevronRight,
  Heart, Thermometer, Droplets, Mic, AlertTriangle, PillBottle
} from 'lucide-react';

export default function PatientHome() {
  const { language } = useApp();
  const patient = patients[0]; // Demo: Lakshmi Devi
  const activeReferrals = referrals.filter(r => r.patientId === patient.id && r.status !== 'closed');
  const upcomingAppointments = appointments.filter(a => a.patientId === patient.id && a.status === 'scheduled');
  const recentNotifications = notifications.filter(n => n.userId === patient.id && !n.read).slice(0, 3);
  const latestVitals = {
    bloodPressureSystolic: 152,
    bloodPressureDiastolic: 95,
    heartRate: 88,
    spO2: 96,
    bloodSugar: 145,
  };

  const quickActions = [
    { label: t('aiAssistant', language), path: '/app/ai-triage', icon: Stethoscope, color: 'bg-primary/10 text-primary' },
    { label: t('findFacilities', language), path: '/app/facilities', icon: MapPin, color: 'bg-emerald-50 text-emerald-600' },
    { label: t('emergency', language), path: '/app/emergency', icon: Phone, color: 'bg-red-50 text-red-600' },
    { label: t('myHealthCard', language), path: '/app/health-card', icon: CreditCard, color: 'bg-violet-50 text-violet-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'ta' ? 'வணக்கம்' : language === 'hi' ? 'नमस्ते' : 'Hello'}, {patient.name.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {language === 'ta' ? 'உங்கள் சுகாதார சுருக்கம்' : language === 'hi' ? 'आपका स्वास्थ्य सारांश' : 'Your health at a glance'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t('online', language)}
          </Badge>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.path} to={action.path}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="flex flex-col items-center gap-2.5 p-4 text-center">
                  <div className={`h-11 w-11 rounded-xl ${action.color} flex items-center justify-center`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-medium text-foreground leading-tight">{action.label}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Vitals Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('vitals', language)}
            </CardTitle>
            <span className="text-xs text-muted-foreground">Jul 28, 2026</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <Heart className="h-4 w-4 mx-auto mb-1 text-red-400" />
              <p className="text-lg font-bold text-foreground">{latestVitals.bloodPressureSystolic}/{latestVitals.bloodPressureDiastolic}</p>
              <p className="text-xs text-muted-foreground">BP (mmHg)</p>
              <Badge variant="outline" className="mt-1 text-[10px] bg-amber-50 text-amber-600 border-amber-200">High</Badge>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <Activity className="h-4 w-4 mx-auto mb-1 text-pink-400" />
              <p className="text-lg font-bold text-foreground">{latestVitals.heartRate}</p>
              <p className="text-xs text-muted-foreground">Heart Rate</p>
              <Badge variant="outline" className="mt-1 text-[10px] bg-emerald-50 text-emerald-600 border-emerald-200">Normal</Badge>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <Droplets className="h-4 w-4 mx-auto mb-1 text-blue-400" />
              <p className="text-lg font-bold text-foreground">{latestVitals.spO2}%</p>
              <p className="text-xs text-muted-foreground">SpO2</p>
              <Badge variant="outline" className="mt-1 text-[10px] bg-emerald-50 text-emerald-600 border-emerald-200">Normal</Badge>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <Thermometer className="h-4 w-4 mx-auto mb-1 text-orange-400" />
              <p className="text-lg font-bold text-foreground">{latestVitals.bloodSugar}</p>
              <p className="text-xs text-muted-foreground">Blood Sugar</p>
              <Badge variant="outline" className="mt-1 text-[10px] bg-amber-50 text-amber-600 border-amber-200">Borderline</Badge>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center col-span-2 sm:col-span-1">
              <Stethoscope className="h-4 w-4 mx-auto mb-1 text-primary" />
              <p className="text-sm font-bold text-foreground mt-1">Last Triage</p>
              <RiskBadge level="high" size="sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Referrals */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-[1.125rem] w-[1.125rem] text-primary" />
                {t('myReferrals', language)}
              </CardTitle>
              <Link to="/app/referrals">
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                  {t('view', language)} <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeReferrals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No active referrals</p>
            ) : (
              activeReferrals.map((ref) => (
                <Link
                  key={ref.id}
                  to={`/app/referrals/${ref.id}`}
                  className="block rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{ref.referralId}</p>
                      <p className="text-xs text-muted-foreground">{ref.department} • {ref.destinationFacilityName}</p>
                    </div>
                    <RiskBadge level={ref.priority === 'emergency' ? 'emergency' : ref.priority === 'urgent' ? 'high' : 'low'} size="sm" />
                  </div>
                  <ReferralProgressMini
                    currentStep={ref.currentStep}
                    totalSteps={ref.totalSteps}
                    isOverdue={ref.isOverdue}
                  />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upcoming Appointments */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-[1.125rem] w-[1.125rem] text-primary" />
                {t('myAppointments', language)}
              </CardTitle>
              <Link to="/app/appointments">
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                  {t('view', language)} <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No upcoming appointments</p>
            ) : (
              upcomingAppointments.map((apt) => {
                const doctor = appointments.length > 0;
                return (
                  <div key={apt.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{apt.department}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{apt.reason}</p>
                      </div>
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                        {apt.date}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{apt.time}</span>
                      <span>•</span>
                      <MapPin className="h-3 w-3" />
                      <span>{facilities.find(f => f.id === apt.facilityId)?.name || 'Hospital'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notifications */}
      {recentNotifications.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-[1.125rem] w-[1.125rem] text-primary" />
              {t('notifications', language)}
              <Badge className="ml-1 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center">
                {recentNotifications.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentNotifications.map((notif) => (
              <div
                key={notif.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
              >
                <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${
                  notif.type === 'alert' ? 'bg-red-500' :
                  notif.type === 'warning' ? 'bg-amber-500' :
                  notif.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{notif.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Emergency Banner */}
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="h-11 w-11 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <Phone className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-900">{t('emergencySupport', language)}</h3>
            <p className="text-xs text-red-700/80 mt-0.5">
              {language === 'ta' ? 'அவசர உதவிக்கு அழைக்கவும்' : language === 'hi' ? 'आपातकालीन सहायता के लिए कॉल करें' : 'Call for immediate emergency assistance'}
            </p>
          </div>
          <Button variant="destructive" size="sm" className="gap-1.5">
            <Phone className="h-4 w-4" />
            108
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
